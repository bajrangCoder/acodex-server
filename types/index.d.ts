import { IPty, IDisposable } from 'node-pty';
import { Terminal } from 'xterm-headless';
import { SerializeAddon } from 'xterm-addon-serialize';

type Session = {
    term: IPty;
    xterm: Terminal;
    serializeAddon: SerializeAddon;
    terminalData: string;
    temporaryDisposable?: IDisposable;
    dataHandler?: IDisposable;
};