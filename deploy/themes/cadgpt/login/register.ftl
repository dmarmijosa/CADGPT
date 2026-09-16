<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('firstName','lastName','email','username','password','password-confirm') displayRequiredFields=true; section>
    <#if section = "header">
        ${msg("registerTitle")}
    <#elseif section = "form">
        <form id="kc-register-form" class="${properties.kcFormClass!}" action="${url.registrationAction}" method="post">
            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcLabelWrapperClass!}">
                    <label for="firstName" class="${properties.kcLabelClass!}">${msg("firstName")}</label>
                </div>
                <div class="${properties.kcInputWrapperClass!}">
                    <input type="text" id="firstName" class="${properties.kcInputClass!}" name="firstName"
                           value="${(register.formData.firstName!'')}"
                           aria-invalid="<#if messagesPerField.existsError('firstName')>true</#if>" />
                    <#if messagesPerField.existsError('firstName')>
                        <span id="input-error-firstname" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.get('firstName'))?no_esc}
                        </span>
                    </#if>
                </div>
            </div>

            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcLabelWrapperClass!}">
                    <label for="lastName" class="${properties.kcLabelClass!}">${msg("lastName")}</label>
                </div>
                <div class="${properties.kcInputWrapperClass!}">
                    <input type="text" id="lastName" class="${properties.kcInputClass!}" name="lastName"
                           value="${(register.formData.lastName!'')}"
                           aria-invalid="<#if messagesPerField.existsError('lastName')>true</#if>" />
                    <#if messagesPerField.existsError('lastName')>
                        <span id="input-error-lastname" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.get('lastName'))?no_esc}
                        </span>
                    </#if>
                </div>
            </div>

            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcLabelWrapperClass!}">
                    <label for="email" class="${properties.kcLabelClass!}">${msg("email")}</label>
                </div>
                <div class="${properties.kcInputWrapperClass!}">
                    <input type="text" id="email" class="${properties.kcInputClass!}" name="email"
                           value="${(register.formData.email!'')}" autocomplete="email"
                           aria-invalid="<#if messagesPerField.existsError('email')>true</#if>" />
                    <#if messagesPerField.existsError('email')>
                        <span id="input-error-email" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.get('email'))?no_esc}
                        </span>
                    </#if>
                </div>
            </div>

            <#if !realm.registrationEmailAsUsername>
                <div class="${properties.kcFormGroupClass!}">
                    <div class="${properties.kcLabelWrapperClass!}">
                        <label for="username" class="${properties.kcLabelClass!}">${msg("username")}</label>
                    </div>
                    <div class="${properties.kcInputWrapperClass!}">
                        <input type="text" id="username" class="${properties.kcInputClass!}" name="username"
                               value="${(register.formData.username!'')}" autocomplete="username"
                               aria-invalid="<#if messagesPerField.existsError('username')>true</#if>" />
                        <#if messagesPerField.existsError('username')>
                            <span id="input-error-username" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                                ${kcSanitize(messagesPerField.get('username'))?no_esc}
                            </span>
                        </#if>
                    </div>
                </div>
            </#if>

            <#if passwordRequired??>
                <div class="${properties.kcFormGroupClass!}">
                    <div class="${properties.kcLabelWrapperClass!}">
                        <label for="password" class="${properties.kcLabelClass!}">${msg("password")}</label>
                    </div>
                    <div class="${properties.kcInputWrapperClass!}">
                        <input type="password" id="password" class="${properties.kcInputClass!}" name="password"
                               autocomplete="new-password"
                               aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>" />
                        <#if messagesPerField.existsError('password')>
                            <span id="input-error-password" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                                ${kcSanitize(messagesPerField.get('password'))?no_esc}
                            </span>
                        </#if>
                    </div>
                </div>

                <div class="${properties.kcFormGroupClass!}">
                    <div class="${properties.kcLabelWrapperClass!}">
                        <label for="password-confirm" class="${properties.kcLabelClass!}">${msg("passwordConfirm")}</label>
                    </div>
                    <div class="${properties.kcInputWrapperClass!}">
                        <input type="password" id="password-confirm" class="${properties.kcInputClass!}"
                               name="password-confirm"
                               aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>" />
                        <#if messagesPerField.existsError('password-confirm')>
                            <span id="input-error-password-confirm" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                                ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
                            </span>
                        </#if>
                    </div>
                </div>
            </#if>

            <#if recaptchaRequired??>
                <div class="form-group">
                    <div class="${properties.kcInputWrapperClass!}">
                        <div class="g-recaptcha" data-size="compact" data-sitekey="${recaptchaSiteKey}"></div>
                    </div>
                </div>
            </#if>

            <div class="${properties.kcFormGroupClass!}">
                <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                    <input id="kc-form-submit" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" type="submit" value="${msg("doRegister")}" disabled />
                </div>
                <div class="${properties.kcFormOptionsClass!}">
                    <div class="${properties.kcFormOptionsWrapperClass!}">
                        <span><a href="${url.loginUrl}">${kcSanitize(msg("backToLogin"))?no_esc}</a></span>
                    </div>
                </div>
            </div>
        </form>

        <div id="consent-backdrop" class="stitch-consent-backdrop active" aria-hidden="true"></div>
        <div id="consent-sheet" class="stitch-consent-sheet active" role="dialog" aria-modal="true" aria-labelledby="consent-title">
            <div class="stitch-consent-header">
                <div class="stitch-consent-badge">GDPR &amp; ISO/IEC 27001</div>
                <h2 id="consent-title" class="stitch-consent-title">Tratamiento de Datos y Gobernanza CAD</h2>
                <p class="stitch-consent-subtitle">
                    Conformidad regulatoria para el procesamiento de modelos paramétricos y privacidad de ingeniería.
                </p>
            </div>

            <div class="stitch-consent-body">
                <div class="stitch-consent-card">
                    <div class="stitch-consent-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                    </div>
                    <div class="stitch-consent-card-text">
                        <strong>Ejecución Local CAD</strong>
                        <p>Los modelos paramétricos CAD y scripts de ingeniería se ejecutan exclusivamente de manera local en los dispositivos vinculados del usuario.</p>
                    </div>
                </div>

                <div class="stitch-consent-card">
                    <div class="stitch-consent-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                            <line x1="12" y1="22.08" x2="12" y2="12"></line>
                        </svg>
                    </div>
                    <div class="stitch-consent-card-text">
                        <strong>Retención de Mallas STL</strong>
                        <p>Únicamente las mallas de previsualización 3D trianguladas (STL) se almacenan temporalmente en el servidor para permitir la visualización en el navegador.</p>
                    </div>
                </div>

                <div class="stitch-consent-card">
                    <div class="stitch-consent-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                    </div>
                    <div class="stitch-consent-card-text">
                        <strong>Derecho al Olvido</strong>
                        <p>Los usuarios conservan el derecho incondicional de supresión permanente para purgar la totalidad de datos de cuenta y máquinas vinculadas en cualquier momento.</p>
                    </div>
                </div>
            </div>

            <div class="stitch-consent-footer">
                <label class="stitch-consent-checkbox-label" for="consent-accept-check">
                    <input type="checkbox" id="consent-accept-check" class="stitch-consent-checkbox" />
                    <span>He leído y acepto los Términos de Servicio y la Política de Privacidad y Tratamiento de Datos.</span>
                </label>

                <button type="button" id="consent-accept-btn" class="stitch-consent-btn" disabled>
                    Aceptar y Continuar
                </button>
            </div>
        </div>

        <script>
        (function() {
            var backdrop = document.getElementById('consent-backdrop');
            var sheet = document.getElementById('consent-sheet');
            var check = document.getElementById('consent-accept-check');
            var acceptBtn = document.getElementById('consent-accept-btn');
            var submitBtn = document.getElementById('kc-form-submit') || document.querySelector('input[type="submit"]');
            var form = document.getElementById('kc-register-form');
            var hasAccepted = false;

            if (submitBtn) {
                submitBtn.disabled = true;
            }

            if (check && acceptBtn) {
                check.addEventListener('change', function() {
                    acceptBtn.disabled = !check.checked;
                });

                acceptBtn.addEventListener('click', function() {
                    if (!check.checked) return;
                    hasAccepted = true;
                    if (sheet) sheet.classList.remove('active');
                    if (backdrop) backdrop.classList.remove('active');
                    if (submitBtn) submitBtn.disabled = false;
                });
            }

            if (backdrop) {
                backdrop.addEventListener('click', function() {
                    if (!hasAccepted && submitBtn) {
                        submitBtn.disabled = true;
                    }
                });
            }

            if (form) {
                form.addEventListener('submit', function(e) {
                    if (!hasAccepted) {
                        e.preventDefault();
                        if (sheet) sheet.classList.add('active');
                        if (backdrop) backdrop.classList.add('active');
                    }
                });
            }
        })();
        </script>
    </#if>
</@layout.registrationLayout>
