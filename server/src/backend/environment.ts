"use strict";

import * as cp from "child_process";
import * as os from "os";
import * as vscode from "vscode-languageserver";
import {IncorrectPathExeption} from "../errorHandling/errors";
import {NotificationService} from "../notificationService";
import {Application, Config, EnvironmentConfig, ErrorMsg, LanguageServerNotification, WarningMsg } from "../strings/stringRessources";
import {DafnySettings} from "./dafnySettings";

export class Command {
    public notFound: boolean = false;
    // tslint:disable-next-line:no-empty
    public constructor(public command: string = null, public args: string[]= null) {};
}

export class Environment {

    public usesMono: boolean;

    constructor(private rootPath: string, private notificationService: NotificationService, private dafnySettings: DafnySettings) {
        this.usesMono = this.dafnySettings.useMono || os.platform() !== EnvironmentConfig.Win32;
    }

    public testCommand(path: string): boolean {
        const process: cp.ChildProcess = cp.exec(path);
        const commandSuccessful: boolean = process.pid !== 0;
        if (commandSuccessful) {
            process.kill();
        }
        return commandSuccessful;
    }

    public getStartDafnyCommand(): Command {
        return this.getCommand(this.dafnySettings.basePath + "/" + Application.DafnyServer);
    }

    public getDafnyExe(): Command {
        return this.getCommand(this.dafnySettings.basePath + "/" + Application.Dafny);
    }

    public getStandardSpawnOptions(): cp.SpawnOptions {
        const options: cp.SpawnOptions = {};
        if (this.rootPath) {
            options.cwd = this.rootPath;
        }
        options.stdio = [
            "pipe", // stdin
            "pipe", // stdout
            0, // ignore stderr
        ];
        return options;
    }

    public usesNonStandardMonoPath(): boolean {
        return this.dafnySettings.useMono && this.dafnySettings.monoPath !== "";
    }

    public getMonoPath(): string {
        let monoPath: string = this.dafnySettings.monoPath;
        const monoInSystemPath: boolean = this.testCommand(EnvironmentConfig.Mono);
        const monoAtConfigPath: boolean = this.dafnySettings.monoPath && this.testCommand(monoPath);
        if (monoInSystemPath && !monoAtConfigPath) {
            monoPath = EnvironmentConfig.Mono;
        } else if (!monoInSystemPath && !monoAtConfigPath) {
            return "";
        }
        return monoPath;
    }
    private getCommand(commandName: string): Command {
        let baseCommand: string;
        let args: string[];
        let monoPath: string = this.dafnySettings.monoPath;
        if(commandName === undefined || commandName === "") {
            throw new IncorrectPathExeption();
        }
        if (!this.usesMono) {
            baseCommand = commandName;
            args = [];
            return new Command(baseCommand, args);
        } else {
            const monoInSystemPath: boolean = this.testCommand(EnvironmentConfig.Mono);
            const monoAtConfigPath: boolean = this.dafnySettings.monoPath && this.testCommand(monoPath);
            if (monoInSystemPath && !monoAtConfigPath) {
                if (this.dafnySettings.monoPath) {
                    this.notificationService.sendWarning(WarningMsg.MonoPathWrong);
                }
                monoPath = EnvironmentConfig.Mono;
            } else if (!monoInSystemPath && !monoAtConfigPath) {
                this.notificationService.sendError(ErrorMsg.NoMono);
                const command: Command = new Command();
                command.notFound = true;
                return command;
            }
            baseCommand = monoPath;
            args = [commandName];
            return new Command(baseCommand, args);
        }
    }
}
