"use strict";
import {TextDocument} from "vscode";
import {DafnyServer} from "../dafnyServer";
import { EnvironmentConfig } from "./../../Strings/stringRessources";
import { hashString } from "./../../Strings/StringUtils";
import { bubbleRejectedPromise } from "./../../Util/PromiseHelpers";
import { Reference, Symbol, SymbolTable } from "./symbols";
export class SymbolService {
    private symbolTable: {[fileName: string]: SymbolTable} = {};

    public constructor(public server: DafnyServer) {}

    public addSymbols(doc: TextDocument, symbols: SymbolTable, forceAddition: boolean = false): void {
        const hash = hashString(doc.getText());
        if(forceAddition) {
            this.symbolTable[doc.fileName] = symbols;
        } else {
            this.getSymbols(doc).then((sym: any) => {
                if(!sym || sym.hash !== hash) {
                    this.symbolTable[doc.fileName] = symbols;
                }
            });
        }
    }

    public getSymbols(doc: TextDocument): Promise<SymbolTable> {
        const symbols = this.symbolTable[doc.fileName];
        if(!symbols) {
            return this.getSymbolsFromDafny(doc).then((symb: SymbolTable) => {
                symb.hash = hashString(doc.getText());
                this.addSymbols(doc, symb, true);
                return Promise.resolve(symb);
            });
        } else {
            return Promise.resolve(symbols);
        }
    }

    public getSymbolsFromDafny(document: TextDocument): Promise<SymbolTable> {
        if (!document) {
            return Promise.resolve(null);
        }
        return new Promise<any>((resolve, reject) => {
                return this.askDafnyForSymbols(resolve, reject, document);
        }).then((symbols: any) => {
            return Promise.resolve(this.parseSymbols(symbols));
        }, bubbleRejectedPromise);
    }
    private parseSymbols(response: any): SymbolTable {
        const symbolTable = new SymbolTable();
        if(response && response.length && response.length > 0) {
            for(const symbol of response) {
                const parsedSymbol = this.parseSymbol(symbol);
                if(parsedSymbol.isValid()) {
                    symbolTable.symbols.push(parsedSymbol);
                }
            }
        }
        return symbolTable;
    }
    private parseSymbol(symbol: any): Symbol {
        const line = Math.max(0, parseInt(symbol.Line, 10) - 1); // 1 based
        const column = Math.max(0, parseInt(symbol.Column, 10) - 1); // ditto, but 0 can appear in some cases
        const module = symbol.Module;
        const name = symbol.Name;
        const parentClass = symbol.ParentClass;
        const position = symbol.Position;
        const parsedSymbol = new Symbol(column, line, module, name, position, parentClass);
        if(parsedSymbol.isValid()) {
            parsedSymbol.setSymbolType(symbol.SymbolType);
            if(symbol.References && symbol.References.length && symbol.References.length > 0) {
                for(const reference of symbol.References) {
                    const parsedReference = this.parseReference(reference);
                    if(parsedReference.isValid()) {
                        parsedSymbol.References.push(parsedReference);
                    }
                }
            }
        }
        return parsedSymbol;
    }
    private parseReference(reference: any): Reference {
        const methodName = reference.MethodName;
        const loc = reference.Position;
        const referenceLine = parseInt(reference.Line, 10) - 1; // 1 based
        const referenceColumn =
            Math.max(0, parseInt(reference.Column, 10) - 1); // ditto, but 0 can appear in some cases
        return new Reference(referenceColumn, referenceLine, loc, methodName);
    }
    private askDafnyForSymbols(resolve: any, reject: any, document: TextDocument) {
        this.server.addDocument(document, "symbols", (log) =>  {
            this.handleProcessData(log, ((data) => {resolve(data); }));
        }, () => {reject(null); });
    }

    private handleProcessData(log: string, callback: (data: any) => any): void {
        if(log && log.indexOf(EnvironmentConfig.DafnySuccess) > 0
                && log.indexOf(EnvironmentConfig.DafnyFailure) < 0 && log.indexOf("SYMBOLS_START ") > -1) {
            const info = log.substring(log.indexOf("SYMBOLS_START ") + "SYMBOLS_START ".length, log.indexOf(" SYMBOLS_END"));
            const json = this.getResponseAsJson(info);
            callback(json);
        }
    }

    private getResponseAsJson(info: string) {
        try {
            return JSON.parse(info);
        } catch(exception) {
            console.error("Failure  to parse response: " + exception + ", json: " + info);
            return null;
        }
    }
}
