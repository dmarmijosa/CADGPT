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

    if ($null -ne $plan.feature) {
        Add-Feature $model $plan.feature
        $model.ForceRebuild3($false) | Out-Null
        Save-As $model $plan.native $swSaveAsOptions_Silent
    }
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
