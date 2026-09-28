/* =========================================================
   Aicha Academy - Main Application Engine (app.js)
   ========================================================= */

import { AITutor } from './ai-tutor.js';

document.addEventListener('DOMContentLoaded', () => {
    // تشغيل الأستاذ الذكي
    const aiTutor = new AITutor();
    setupMascotMotion();

    function setupMascotMotion() {
        const mascot = document.getElementById('floatingMascot');
        if (!mascot || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let audioContext;

        function activateMascotAudio() {
            if (!audioContext) audioContext = new AudioContext();
            if (audioContext.state === 'suspended') audioContext.resume();
        }

        function playFootstep(delay) {
            if (!audioContext || audioContext.state !== 'running') return;
            const start = audioContext.currentTime + delay;
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(125, start);
            oscillator.frequency.exponentialRampToValueAtTime(58, start + 0.09);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
            oscillator.connect(gain).connect(audioContext.destination);
            oscillator.start(start);
            oscillator.stop(start + 0.12);
        }

        document.addEventListener('pointerdown', activateMascotAudio, { once: true, passive: true });
        mascot.addEventListener('click', activateMascotAudio);

        const appearanceInterval = 30 * 60 * 1000;
        const appearanceDuration = 10 * 1000;
        let movementTimer;
        let hideTimer;

        const targets = () => [...document.querySelectorAll(
            '.academy-view:not([hidden]) .welcome-card, .academy-view:not([hidden]) .subject-card, ' +
            '.academy-view:not([hidden]) .progress-summary-card, .academy-view:not([hidden]) .tool-button, ' +
            '.academy-view:not([hidden]) .mastery-action-card'
        )].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });

        const restAtWindowEdge = () => {
            if (mascot.hidden) return;
            const availableTargets = targets();
            if (!availableTargets.length) return;

            const target = availableTargets[Math.floor(Math.random() * availableTargets.length)];
            const rect = target.getBoundingClientRect();
            const mascotWidth = mascot.offsetWidth;
            const mascotHeight = mascot.offsetHeight;
            const leanLeft = Math.random() > 0.5;
            const x = Math.max(8, Math.min(window.innerWidth - mascotWidth - 8,
                leanLeft ? rect.left - mascotWidth * 0.35 : rect.right - mascotWidth * 0.65));
            const y = Math.max(72, Math.min(window.innerHeight - mascotHeight - 12, rect.top - mascotHeight * 0.52));

            mascot.classList.remove('edge-left', 'edge-right', 'is-resting');
            mascot.offsetWidth;
            mascot.classList.add('is-moving');
            mascot.style.left = `${x}px`;
            mascot.style.top = `${y}px`;
            mascot.classList.add(leanLeft ? 'edge-left' : 'edge-right', 'is-resting');
            playFootstep(0.18);
            playFootstep(0.72);
            window.setTimeout(() => mascot.classList.remove('is-moving'), 1300);
            window.setTimeout(() => mascot.classList.remove('is-resting'), 1500);
        };

        const hideMascot = () => {
            mascot.hidden = true;
            mascot.classList.remove('is-moving', 'is-resting', 'edge-left', 'edge-right');
            window.clearInterval(movementTimer);
        };

        const showMascot = () => {
            mascot.hidden = false;
            restAtWindowEdge();
            movementTimer = window.setInterval(restAtWindowEdge, 5200);
            hideTimer = window.setTimeout(hideMascot, appearanceDuration);
        };

        window.setTimeout(() => {
            showMascot();
            window.setInterval(showMascot, appearanceInterval);
        }, appearanceInterval);
        window.addEventListener('resize', () => {
            if (!mascot.hidden) restAtWindowEdge();
        }, { passive: true });
    }

    // إدارة التنقل بين الواحات (Views)
    const navButtons = document.querySelectorAll('.nav-button');
    const views = document.querySelectorAll('.academy-view');

    function switchView(viewName) {
        views.forEach(v => {
            if (v.getAttribute('data-view-section') === viewName) {
                v.removeAttribute('hidden');
            } else {
                v.setAttribute('hidden', 'true');
            }
        });

        navButtons.forEach(btn => {
            if (btn.getAttribute('data-view') === viewName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        window.scrollTo(0, 0);
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            switchView(view);
        });
    });

    // ربط بطاقات المواد الدراسية بالانتقال
    const subjectCards = document.querySelectorAll('.subject-card');
    subjectCards.forEach(card => {
        card.addEventListener('click', () => {
            const subject = card.getAttribute('data-subject');
            window.currentSubject = subject;
            
            // الانتقال إلى شاشة الوحدات/الدروس
            document.getElementById('selectedSubjectTitle').textContent = card.querySelector('h3').textContent;
            document.getElementById('selectedSubjectLabel').textContent = 'المادة الدراسية';
            
            // فتح صفحة مساحة العمل كمثال تجريبي مباشر
            switchView('workspace');
            document.getElementById('workspaceSubject').textContent = card.querySelector('h3').textContent;
            document.getElementById('workspaceLessonTitle').textContent = 'الدرس التجريبي الأول: المفاهيم الأساسية';
            document.getElementById('lessonContent').textContent = 'مرحباً بك يا بني(ة) في درسك الأول. هذا المحتوى مرتبط بالمناهج الرسمية الجزائرية لجذع مشترك علوم وتكنولوجيا. استخدم(ي) الأستاذ الذكي أدناه لطرح الأسئلة أو ارفع(ي) صورة لتمرينك!';
        });
    });

    // أزرار الرجوع
    const backToHome = document.getElementById('backFromWorkspace');
    if (backToHome) {
        backToHome.addEventListener('click', () => switchView('home'));
    }

    const openTutorBtn = document.getElementById('openTutorButton');
    if (openTutorBtn) {
        openTutorBtn.addEventListener('click', () => {
            switchView('workspace');
        });
    }

    // إدارة النوافذ المنبثقة (Modals: Calculator, GeoGebra, Admin)
    setupModal('calculatorButton', 'calculatorModal', 'closeCalculatorButton');
    setupModal('workspaceCalculatorButton', 'calculatorModal', 'closeCalculatorButton');
    
    setupDirectLink('geogebraButton', 'https://www.geogebra.org/classic');
    setupDirectLink('workspaceGeoGebraButton', 'https://www.geogebra.org/classic');

    setupModal('adminButton', 'adminModal', 'closeAdminButton');
    setupAdminPanel();

    function setupAdminPanel() {
        const loginForm = document.getElementById('adminLoginForm');
        const loginPanel = document.getElementById('adminLoginPanel');
        const dashboard = document.getElementById('adminDashboard');
        const loginError = document.getElementById('adminLoginError');
        const sourceForm = document.getElementById('sourceUploadForm');
        const sourcesList = document.getElementById('adminSourcesList');
        const refreshButton = document.getElementById('refreshSourcesButton');
        const logoutButton = document.getElementById('adminLogoutButton');

        const getToken = () => sessionStorage.getItem('aichaAdminToken');
        const setAdminView = isAdmin => {
            loginPanel.hidden = isAdmin;
            dashboard.hidden = !isAdmin;
        };

        async function loadAdminSources() {
            const response = await fetch('/api/admin/sources', {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (response.status === 401) {
                sessionStorage.removeItem('aichaAdminToken');
                setAdminView(false);
                throw new Error('انتهت جلسة المشرف.');
            }
            const data = await response.json();
            renderAdminSources(data.sources || []);
        }

        function renderAdminSources(sources) {
            sourcesList.replaceChildren();
            if (!sources.length) {
                sourcesList.textContent = 'لا توجد مصادر مضافة بعد.';
                return;
            }

            sources.forEach(source => {
                const item = document.createElement('div');
                item.className = 'admin-source-item';
                const title = document.createElement('strong');
                title.textContent = source.title;
                const details = document.createElement('small');
                details.textContent = `${source.kind === 'website' ? source.url : source.originalName} - ${source.subject}`;
                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'secondary-button';
                removeButton.textContent = 'حذف';
                removeButton.addEventListener('click', async () => {
                    const response = await fetch(`/api/admin/sources/${source.id}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${getToken()}` }
                    });
                    if (!response.ok) {
                        showAdminError('تعذر حذف المصدر.');
                        return;
                    }
                    await loadAdminSources();
                });
                item.append(title, details, removeButton);
                sourcesList.appendChild(item);
            });
        }

        function showAdminError(message) {
            loginError.textContent = message;
            loginError.hidden = false;
        }

        loginForm.addEventListener('submit', async event => {
            event.preventDefault();
            loginError.hidden = true;
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: document.getElementById('adminPassword').value })
            });
            const data = await response.json();
            if (!response.ok) {
                showAdminError(data.error || 'تعذر تسجيل الدخول.');
                return;
            }
            sessionStorage.setItem('aichaAdminToken', data.token);
            loginForm.reset();
            setAdminView(true);
            await loadAdminSources();
        });

        sourceForm.addEventListener('submit', async event => {
            event.preventDefault();
            const formData = new FormData();
            const selectedFile = document.getElementById('sourceFileInput').files[0];
            const sourceUrl = document.getElementById('sourceUrl').value.trim();
            if (selectedFile) formData.append('source', selectedFile);
            if (sourceUrl) formData.append('url', sourceUrl);
            formData.append('title', document.getElementById('sourceTitle').value.trim());
            formData.append('subject', document.getElementById('sourceSubject').value);
            formData.append('type', document.getElementById('sourceType').value);
            const response = await fetch('/api/admin/sources', {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
                body: formData
            });
            const data = await response.json();
            if (!response.ok) {
                showAdminError(data.error || 'تعذر رفع المصدر.');
                return;
            }
            sourceForm.reset();
            await loadAdminSources();
        });

        refreshButton.addEventListener('click', loadAdminSources);
        logoutButton.addEventListener('click', () => {
            sessionStorage.removeItem('aichaAdminToken');
            setAdminView(false);
        });

        document.querySelectorAll('[data-admin-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('[data-admin-tab]').forEach(item => item.classList.remove('active'));
                document.querySelectorAll('[data-admin-panel]').forEach(panel => panel.hidden = true);
                tab.classList.add('active');
                document.querySelector(`[data-admin-panel="${tab.dataset.adminTab}"]`).hidden = false;
            });
        });

        if (getToken()) {
            setAdminView(true);
            loadAdminSources().catch(() => setAdminView(false));
        }
    }

    function setupModal(triggerId, modalId, closeId) {
        const trigger = document.getElementById(triggerId);
        const modal = document.getElementById(modalId);
        const closeBtn = document.getElementById(closeId);

        if (trigger && modal) {
            trigger.addEventListener('click', () => modal.removeAttribute('hidden'));
        }
        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => modal.setAttribute('hidden', 'true'));
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.setAttribute('hidden', 'true');
            });
        }
    }

    function setupDirectLink(triggerId, url) {
        const trigger = document.getElementById(triggerId);
        if (!trigger) return;
        trigger.addEventListener('click', () => window.open(url, '_blank', 'noopener,noreferrer'));
    }

    // منطق الآلة الحاسبة البسيط للتفاعل المبدئي
    const calcDisplay = document.getElementById('calculatorDisplay');
    const calcGrid = document.getElementById('calculatorGrid');
    let calcExpression = '0';

    if (calcGrid) {
        calcGrid.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') return;
            const action = e.target.getAttribute('data-calc');

            if (action === 'clear') {
                calcExpression = '0';
            } else if (action === 'equals') {
                try {
                    // تعبير حسابي آمن مبدئي
                    calcExpression = eval(calcExpression.replace(/×/g, '*').replace(/÷/g, '/')).toString();
                } catch {
                    calcExpression = 'Math Error';
                }
            } else if (action === 'delete') {
                calcExpression = calcExpression.length > 1 ? calcExpression.slice(0, -1) : '0';
            } else {
                const val = e.target.textContent;
                calcExpression = calcExpression === '0' ? val : calcExpression + val;
            }
            calcDisplay.textContent = calcExpression;
        });
    }

    console.log("Aicha Academy Frontend Initialized Successfully.");
});