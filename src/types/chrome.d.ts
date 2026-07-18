// types/chrome.d.ts
export {};

declare global {
    interface Window {
        chrome?: {
            runtime?: {
                sendMessage?: (
                    extensionId: string,
                    message: unknown,
                    responseCallback?: (response: any) => void,
                ) => void;
                lastError?: { message: string } | undefined;
            };
        };
    }
}
