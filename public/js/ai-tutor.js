/* =========================================================
   Aicha Academy - AI Tutor Module (ai-tutor.js)
   ========================================================= */

export class AITutor {
    constructor() {
        this.apiEndpoint = '/api/ai';
        this.messagesContainer = document.getElementById('tutorMessages');
        this.tutorForm = document.getElementById('tutorForm');
        this.tutorInput = document.getElementById('tutorInput');
        this.fileInput = document.getElementById('studentFileInput');
        this.sendButton = document.getElementById('sendTutorButton');
        this.muteButton = document.getElementById('tutorMuteButton');
        this.isMuted = localStorage.getItem('aichaTutorMuted') === 'true';
        this.activeSpeech = null;
        
        this.initListeners();
    }

    initListeners() {
        if (!this.tutorForm) return;

        this.tutorForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleSendMessage();
        });

        this.muteButton?.addEventListener('click', () => {
            this.isMuted = !this.isMuted;
            localStorage.setItem('aichaTutorMuted', String(this.isMuted));
            if (this.isMuted) window.speechSynthesis?.cancel();
            this.updateMuteButton();
        });
        this.updateMuteButton();
        this.messagesContainer?.querySelectorAll('[data-speak-message]').forEach(button => {
            button.addEventListener('click', () => this.speakMessage(button.closest('.tutor-message')));
        });
    }

    async handleSendMessage() {
        const questionText = this.tutorInput.value.trim();
        const attachedFile = this.fileInput.files[0];

        if (!questionText && !attachedFile) return;

        // 1. عرض رسالة الطالب في المحادثة
        this.appendMessage('user', questionText || '📎 [تم إرفاق صورة/ملف]', attachedFile);

        // تفريغ الحقول وإظهار حالة التحميل
        this.tutorInput.value = '';
        this.setLoading(true);

        try {
            // 2. إعداد FormData لإرسال النص والملف بأمان للخادم
            const formData = new FormData();
            formData.append('message', questionText);
            
            // جلب السياق الحالي أو المادة إن وجدت
            const currentSubject = window.currentSubject || 'mathematics';
            formData.append('subject', currentSubject);

            if (attachedFile) {
                formData.append('image', attachedFile);
            }

            // 3. إرسال الطلب لخادم الخلفية الآمن
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'حدث خطأ في الاتصال بالخادم الذكي.');
            }

            // 4. عرض رد الأستاذ الذكي السقراطي
            this.appendMessage('ai', data.reply);

        } catch (error) {
            console.error('AI Tutor Error:', error);
            this.appendMessage('ai', `⚠️ ${error.message || 'حدث خطأ بسيط في الاتصال. حاول(ي) مرة أخرى.'}`);
        } finally {
            // إعادة تعيين حقل الملف وإيقاف التحميل
            this.fileInput.value = '';
            this.setLoading(false);
        }
    }

    appendMessage(sender, text, file = null) {
        if (!this.messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `tutor-message tutor-message-${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'ai' ? '🤖' : '🧑‍🎓';

        const body = document.createElement('div');
        body.className = 'message-body';

        const strong = document.createElement('strong');
        strong.textContent = sender === 'ai' ? 'الأستاذ الذكي' : 'الطالب(ة)';

        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        this.renderMessageText(messageText, text);

        if (sender === 'ai') {
            const speakButton = document.createElement('button');
            speakButton.type = 'button';
            speakButton.className = 'message-speak-button';
            speakButton.textContent = '🔊 استمع';
            speakButton.setAttribute('aria-label', 'الاستماع إلى رد الأستاذ');
            speakButton.addEventListener('click', () => this.speakMessage(messageDiv));
            body.appendChild(speakButton);
        }

        body.appendChild(strong);
        body.appendChild(messageText);

        // إذا كان هناك ملف مرفع (صورة)، نعرض معاينة مصغرة لها
        if (file && file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.style.maxWidth = '150px';
            img.style.borderRadius = '8px';
            img.style.marginTop = '8px';
            body.appendChild(img);
        }

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(body);

        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // إعادة معالجة الرياضيات عبر MathJax إن وجدت صيغ رياضية في الرد
        if (window.MathJax && typeof window.MathJax.typeset === 'function') {
            window.MathJax.typeset();
        }
    }

    speakMessage(messageElement) {
        if (this.isMuted || !messageElement || !('speechSynthesis' in window)) return;
        const text = messageElement.querySelector('.message-text')?.textContent.trim();
        if (!text) return;

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        utterance.rate = 0.92;
        utterance.pitch = 1;
        this.activeSpeech = utterance;
        window.speechSynthesis.speak(utterance);
    }

    renderMessageText(container, text) {
        const lines = this.normalizeScientificText(text).split(/\r?\n/);
        let list = null;

        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                list = null;
                container.appendChild(document.createElement('br'));
                return;
            }

            if (/^---+$/.test(trimmedLine)) {
                list = null;
                container.appendChild(document.createElement('hr'));
                return;
            }

            const listMatch = trimmedLine.match(/^[-*]\s+(.+)/);
            if (listMatch) {
                if (!list) {
                    list = document.createElement('ul');
                    container.appendChild(list);
                }
                const item = document.createElement('li');
                this.renderInlineText(item, listMatch[1]);
                list.appendChild(item);
                return;
            }

            list = null;
            const headingMatch = trimmedLine.match(/^#{1,3}\s+(.+)/);
            const lineElement = headingMatch ? document.createElement('strong') : document.createElement('div');
            this.renderInlineText(lineElement, headingMatch ? headingMatch[1] : trimmedLine);
            container.appendChild(lineElement);
        });
    }

    renderInlineText(container, text) {
        const parts = String(text).split(/(\*\*.+?\*\*|\*[^*\n]+\*)/g);
        parts.forEach(part => {
            if (!part) return;
            if (part.startsWith('**') && part.endsWith('**')) {
                const strong = document.createElement('strong');
                strong.textContent = part.slice(2, -2);
                container.appendChild(strong);
            } else if (part.startsWith('*') && part.endsWith('*')) {
                const emphasis = document.createElement('em');
                emphasis.textContent = part.slice(1, -1);
                container.appendChild(emphasis);
            } else {
                container.appendChild(document.createTextNode(part));
            }
        });
    }

    normalizeScientificText(text) {
        return String(text)
            .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
            .replace(/(\d)،(?=\d)/g, '$1.');
    }

    updateMuteButton() {
        if (!this.muteButton) return;
        this.muteButton.textContent = this.isMuted ? '🔇 مكتوم' : '🔊 الصوت';
        this.muteButton.setAttribute('aria-pressed', String(this.isMuted));
        this.muteButton.setAttribute('aria-label', this.isMuted ? 'تشغيل صوت الأستاذ' : 'كتم صوت الأستاذ');
    }

    setLoading(isLoading) {
        if (!this.sendButton) return;
        if (isLoading) {
            this.sendButton.disabled = true;
            this.sendButton.textContent = 'جاري التفكير...';
        } else {
            this.sendButton.disabled = false;
            this.sendButton.textContent = 'إرسال السؤال';
        }
    }
}