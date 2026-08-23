export function printReport() {
    window.print();
}

export async function shareReport(options = {}) {
    const title =
        options.title ||
        document.title ||
        'JOKJUNG Back Office';

    const text =
        options.text ||
        title;

    const url =
        options.url ||
        window.location.href;

    if (navigator.share) {
        try {
            await navigator.share({
                title,
                text,
                url
            });

            return {
                ok: true,
                method: 'share'
            };
        } catch (error) {
            if (error?.name === 'AbortError') {
                return {
                    ok: false,
                    cancelled: true
                };
            }

            throw error;
        }
    }

    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(
            `${text}\n${url}`
        );

        return {
            ok: true,
            method: 'clipboard'
        };
    }

    window.prompt(
        'Copy report link',
        url
    );

    return {
        ok: true,
        method: 'prompt'
    };
}

export function attachReportActions(options = {}) {
    const printButton =
        typeof options.printButton === 'string'
            ? document.getElementById(options.printButton)
            : options.printButton;

    const shareButton =
        typeof options.shareButton === 'string'
            ? document.getElementById(options.shareButton)
            : options.shareButton;

    if (printButton) {
        printButton.addEventListener(
            'click',
            () => printReport()
        );
    }

    if (shareButton) {
        shareButton.addEventListener(
            'click',
            async () => {
                shareButton.disabled = true;

                try {
                    const result =
                        await shareReport({
                            title:
                                options.title ||
                                document.title,

                            text:
                                typeof options.getShareText === 'function'
                                    ? options.getShareText()
                                    : options.text,

                            url:
                                options.url ||
                                window.location.href
                        });

                    if (
                        result?.method === 'clipboard'
                        &&
                        typeof options.onCopied === 'function'
                    ) {
                        options.onCopied();
                    }
                } catch (error) {
                    console.error(
                        'Share report error:',
                        error
                    );

                    if (
                        typeof options.onError === 'function'
                    ) {
                        options.onError(error);
                    }
                } finally {
                    shareButton.disabled = false;
                }
            }
        );
    }
}


export function installReportToolbar(options = {}) {
    const target = options.target || document.querySelector('.page-head') || document.querySelector('.content');
    if (!target) return null;

    let box = document.getElementById('globalReportActions');
    if (!box) {
        box = document.createElement('div');
        box.id = 'globalReportActions';
        box.className = 'report-actions auto-report-actions no-print';
        box.innerHTML = `
            <button id="globalShareBtn" class="outline-btn" type="button">📤 แชร์</button>
            <button id="globalPrintBtn" class="outline-btn" type="button">🖨️ พิมพ์</button>
        `;
        target.appendChild(box);
    }

    const shareButton = document.getElementById('globalShareBtn');
    const printButton = document.getElementById('globalPrintBtn');
    const getText = () => {
        const heading = document.querySelector('.page-head h2')?.textContent?.trim() || document.querySelector('.topbar h1')?.textContent?.trim() || document.title;
        const branch = document.getElementById('branchText')?.textContent?.trim() || '';
        return [heading, branch].filter(Boolean).join('\n');
    };

    attachReportActions({
        shareButton,
        printButton,
        title: options.title || document.title,
        getShareText: options.getShareText || getText,
        onCopied: options.onCopied || (() => {
            const oldText = shareButton?.textContent;
            if (shareButton) {
                shareButton.textContent = '✅ คัดลอกลิงก์แล้ว';
                setTimeout(() => { shareButton.textContent = oldText || '📤 แชร์'; }, 1400);
            }
        })
    });

    return box;
}
