# solidworks_worker.ps1 - fixed SOLIDWORKS COM worker invoked by CAD Engine.
#
# Usage (built by agent/cadgpt_agent/strategies/solidworks.py, never by hand):
#   powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File solidworks_worker.ps1 <plan.json>
#
# The plan holds only values the Python strategy already validated: a fixed
# op/feature kind, numbers in metres, and job/doc-dir-derived paths. This
# script never evaluates plan content as code and never builds a command
# line from it.
#
# Geometry convention: every feature is sketched on the part's first
# reference plane (Front, the world XY plane) and extruded along +Z. Planes
# are found by feature type, not by name, so localized templates work too.
#
# Existing bodies are addressed as Body<N>: the 1-based position in
# GetBodies2, which is also how read_scene names them.

param([Parameter(Mandatory = $true)][string]$PlanPath)

$ErrorActionPreference = 'Stop'

$swDocPART = 1
$swOpenDocOptions_Silent = 1
$swDefaultTemplatePart = 8
$swSaveAsCurrentVersion = 0
$swSaveAsOptions_Silent = 1
$swSaveAsOptions_Copy = 2
$swEndCondBlind = 0
$swStartSketchPlane = 0
$swStartOffset = 3
$swSolidBody = 0
$SWBODYINTERSECT = 15901
$SWBODYCUT = 15902
$SWBODYADD = 15903
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

$plan = Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8 | ConvertFrom-Json

# Attach-or-launch. Only quit SOLIDWORKS afterwards when this worker started
# it, so a user's own open session is never closed under them.
$wasRunning = $null -ne (Get-Process -Name 'SLDWORKS' -ErrorAction SilentlyContinue)
$sw = New-Object -ComObject 'SldWorks.Application'
if (-not $wasRunning) {
    $sw.Visible = $false
    $sw.UserControl = $false
}

function Get-FrontPlane($model) {
    $feature = $model.FirstFeature()
    while ($null -ne $feature) {
        if ($feature.GetTypeName2() -eq 'RefPlane') { return $feature }
        $feature = $feature.GetNextFeature()
    }
    throw 'The part template has no reference plane.'
}

function Add-Feature($model, $f) {
    $plane = Get-FrontPlane $model
    $model.ClearSelection2($true) | Out-Null
    if (-not $plane.Select2($false, 0)) { throw 'Could not select the front plane.' }
    $sketches = $model.SketchManager
    $sketches.AddToDB = $true
    $sketches.InsertSketch($true)
    switch ($f.kind) {
        'box' {
            $sketches.CreateCornerRectangle($f.x, $f.y, 0, $f.x + $f.length, $f.y + $f.width, 0) | Out-Null
            $depth = $f.height
        }
        'cylinder' {
            $sketches.CreateCircleByRadius($f.x, $f.y, 0, $f.radius) | Out-Null
            $depth = $f.height
        }
        default { throw "Unsupported feature kind: $($f.kind)" }
    }
    $sketches.AddToDB = $false
    $startCondition = if ($f.z -eq 0) { $swStartSketchPlane } else { $swStartOffset }
    $feature = $model.FeatureManager.FeatureExtrusion2(
        $true, $false, $false, $swEndCondBlind, $swEndCondBlind, $depth, 0.0,
        $false, $false, $false, $false, 0.0, 0.0, $false, $false, $false, $false,
        $false, $true, $true, $startCondition, [math]::Abs($f.z), ($f.z -lt 0))
    if ($null -eq $feature) { throw 'SOLIDWORKS rejected the extrusion.' }
}

function Get-SolidBodies($model) {
    $bodies = $model.GetBodies2($swSolidBody, $false)
    if ($null -eq $bodies) { return @() }
    return @($bodies)
}

function Resolve-Body($model, [string]$reference) {
    $bodies = Get-SolidBodies $model
    $index = [int]$reference.Substring(4) - 1
    if ($index -lt 0 -or $index -ge $bodies.Count) {
        throw "Body $reference does not exist (the part has $($bodies.Count) solid bodies)."
    }
    return $bodies[$index]
}

function Select-Body($model, $body, [int]$mark) {
    $data = $model.SelectionManager.CreateSelectData()
    $data.Mark = $mark
    if (-not $body.Select2($true, $data)) { throw 'Could not select the body.' }
}

function Invoke-Edit($model, $e) {
    $model.ClearSelection2($true) | Out-Null
    $features = $model.FeatureManager
    switch ($e.kind) {
        'translate' {
            Select-Body $model (Resolve-Body $model $e.body) 1
            $feature = $features.InsertMoveCopyBody2($e.dx, $e.dy, $e.dz, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, $false, 1)
        }
        'rotate' {
            Select-Body $model (Resolve-Body $model $e.body) 1
            $ax = if ($e.axis -eq 'X') { $e.radians } else { 0.0 }
            $ay = if ($e.axis -eq 'Y') { $e.radians } else { 0.0 }
            $az = if ($e.axis -eq 'Z') { $e.radians } else { 0.0 }
            $feature = $features.InsertMoveCopyBody2(0.0, 0.0, 0.0, 0.0, $e.cx, $e.cy, $e.cz, $ax, $ay, $az, $false, 1)
        }
        'cut' {
            $base = Resolve-Body $model $e.base
            $tool = Resolve-Body $model $e.tool
            $feature = $features.InsertCombineFeature($SWBODYCUT, $base, [object[]]@($tool))
        }
        'union' {
            $bodies = [object[]]@((Resolve-Body $model $e.base), (Resolve-Body $model $e.tool))
            $feature = $features.InsertCombineFeature($SWBODYADD, $null, $bodies)
        }
        'intersect' {
            $bodies = [object[]]@((Resolve-Body $model $e.base), (Resolve-Body $model $e.tool))
            $feature = $features.InsertCombineFeature($SWBODYINTERSECT, $null, $bodies)
        }
        default { throw "Unsupported edit kind: $($e.kind)" }
    }
    if ($null -eq $feature) { throw "SOLIDWORKS rejected the $($e.kind) edit." }
}

function Write-Scene($model, [string]$path) {
    $entries = @()
    $i = 0
    foreach ($body in (Get-SolidBodies $model)) {
        $i++
        $box = $body.GetBodyBox()
        $mass = $body.GetMassProperties(1.0)
        $label = [string]$body.Name
        if ($label.Length -gt 60) { $label = $label.Substring(0, 60) }
        $entries += [ordered]@{
            name   = "Body$i"
            label  = $label
            type   = 'SolidBody'
            bbox   = @($box | ForEach-Object { [double]$_ * 1000.0 })
            volume = [double]$mass[3] * 1e9
        }
    }
    # No BOM: the agent parses this file as strict UTF-8 JSON.
    $json = ConvertTo-Json -InputObject @($entries) -Depth 4
    [System.IO.File]::WriteAllText($path, $json, $Utf8NoBom)
}

function Save-As($model, [string]$path, [int]$options) {
    $errors = $model.SaveAs3($path, $swSaveAsCurrentVersion, $options)
    if ($errors -ne 0 -or -not (Test-Path -LiteralPath $path)) {
        throw "SOLIDWORKS could not write $path (error $errors)."
    }
}

$model = $null
$exitCode = 0
try {
    if ($plan.open_existing) {
        $errors = 0
        $warnings = 0
        $model = $sw.OpenDoc6($plan.native, $swDocPART, $swOpenDocOptions_Silent, '', [ref]$errors, [ref]$warnings)
        if ($null -eq $model) { throw "SOLIDWORKS could not open the part (error $errors)." }
    }
    else {
        $template = $sw.GetUserPreferenceStringValue($swDefaultTemplatePart)
        $model = $sw.NewDocument($template, 0, 0.0, 0.0)
        if ($null -eq $model) { throw 'SOLIDWORKS could not create a part from the default template.' }
    }

    if ($null -ne $plan.feature) { Add-Feature $model $plan.feature }
    if ($null -ne $plan.edit) { Invoke-Edit $model $plan.edit }
    if ($null -ne $plan.feature -or $null -ne $plan.edit) {
        $model.ForceRebuild3($false) | Out-Null
        Save-As $model $plan.native $swSaveAsOptions_Silent
    }
    if ($null -ne $plan.scene) { Write-Scene $model $plan.scene }
    if ($null -ne $plan.export) {
        Save-As $model $plan.export ($swSaveAsOptions_Silent + $swSaveAsOptions_Copy)
    }
    Save-As $model $plan.stl ($swSaveAsOptions_Silent + $swSaveAsOptions_Copy)
}
catch {
    Write-Output $_.Exception.Message
    $exitCode = 1
}
finally {
    if ($null -ne $model) { $sw.CloseDoc($model.GetTitle()) }
    if (-not $wasRunning) { $sw.ExitApp() }
}
exit $exitCode
