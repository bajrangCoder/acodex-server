import * as os from 'os';

interface Colors {
    reset: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    [key: string]: string; // Index signature to allow any string key
}

export function coloredText(text: string | number, color: string): string {
    const colors: Colors = {
        reset: '\x1b[0m',
        black: '\x1b[30m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
    };

    const selectedColor = colors[color] || colors.reset;
    return `${selectedColor}${text}${colors.reset}`;
}

export function getIPAddress(): string | boolean {
    const interfaces = os.networkInterfaces();
    for (const key in interfaces) {
        if (interfaces.hasOwnProperty(key)) {
            const ifaceList = interfaces[key];
            if (ifaceList) {
                for (const iface of ifaceList) {
                    if (!iface.internal && iface.family === 'IPv4') {
                        return iface.address;
                    }
                }
            }
        }
    }
    return false;
}