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
