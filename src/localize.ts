/*
 * @Author: PaulShorey
 * @Date: 2022-02-21 11:44:01
 * @LastEditors: PaulShorey
 * @LastEditTime: 2022-02-25 12:44:34
 * @FilePath: /vscode-package-builder/src/localize.ts
 * @Description:
 * vscode多语言支持
 * Copyright (c) 2022 by PaulShorey, All Rights Reserved.
 */
import { existsSync, readFileSync } from 'fs-extra';
import { resolve } from 'path';
import { extensions } from 'vscode';

export interface ILanguagePack {
	[key: string]: string;
}

export class Localize {
	private bundle = this.resolveLanguagePack();
	private options!: { locale: string };

	public localize(key: string, ...args: string[]): string {
		const message = this.bundle[key] || key;
		return this.format(message, args);
	}

	private init() {
		try {
			this.options = {
				...this.options,
				...JSON.parse(process.env.VSCODE_NLS_CONFIG || '{}'),
			};
		} catch (err) {
			throw err;
		}
	}

	private format(message: string, args: string[] = []): string {
		return args.length ? message.replace(/\{(\d+)\}/g, (match, rest: any[]) => args[rest[0]] || match) : message;
	}

	/**
	 * @description: 加载多语言配置文件，配置文件命名规则为：package.nls{0}.json ,{0}为对应的语言代码,如en,zh_cn...
	 * @param {*}
	 * @return {ILanguagePack} 多语言字典
	 */
	private resolveLanguagePack(): ILanguagePack {
		this.init();

		const languageFormat = 'package.nls{0}.json';
		const defaultLanguage = languageFormat.replace('{0}', '');

		let rootPath = extensions?.getExtension('PaulShorey.gitlens')?.extensionPath;
		if (rootPath === undefined) {
			rootPath = extensions.getExtension.name;
		}
		const resolvedLanguage = this.recurseCandidates(rootPath, languageFormat, this.options.locale);

		const languageFilePath = resolve(rootPath, resolvedLanguage);

		try {
			const defaultLanguageBundle = JSON.parse(
				resolvedLanguage !== defaultLanguage ? readFileSync(resolve(rootPath, defaultLanguage), 'utf-8') : '{}',
			);

			const resolvedLanguageBundle = JSON.parse(readFileSync(languageFilePath, 'utf-8'));

			return { ...defaultLanguageBundle, ...resolvedLanguageBundle };
		} catch (err) {
			throw err;
		}
	}

	private recurseCandidates(rootPath: string, format: string, candidate: string): string {
		const filename = format.replace('{0}', `.${candidate}`);
		const filepath = resolve(rootPath, filename);
		if (existsSync(filepath)) {
			return filename;
		}
		if (candidate.split('-')[0] !== candidate) {
			return this.recurseCandidates(rootPath, format, candidate.split('-')[0]);
		}
		return format.replace('{0}', '');
	}
}

export default Localize.prototype.localize.bind(new Localize());
