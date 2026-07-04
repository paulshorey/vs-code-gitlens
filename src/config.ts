'use strict';

export enum TraceLevel {
	Silent = 'silent',
	Errors = 'errors',
	Verbose = 'verbose',
	Debug = 'debug',
}

export interface Config {
	autolinks: AutolinkReference[] | null;
	blame: {
		ignoreWhitespace: boolean;
	};
	debug: boolean;
	defaultDateFormat: string | null;
	defaultDateShortFormat: string | null;
	defaultDateSource: DateSource;
	defaultDateStyle: DateStyle;
	defaultGravatarsStyle: GravatarDefaultStyle;
	defaultTimeFormat: string | null;
	gitCommands: {
		closeOnFocusOut: boolean;
		search: {
			matchAll: boolean;
			matchCase: boolean;
			matchRegex: boolean;
			showResultsInSideBar: boolean | null;
		};
		skipConfirmations: string[];
		sortBy: GitCommandSorting;
	};
	hovers: {
		avatars: boolean;
		avatarSize: number;
	};
	integrations: {
		enabled: boolean;
	};
	outputLevel: TraceLevel;
	partners: Record<
		string,
		{
			enabled: boolean;
			[key: string]: any;
		}
	> | null;
	remotes: RemotesConfig[] | null;
	sortBranchesBy: BranchSorting;
	sortContributorsBy: ContributorSorting;
	sortTagsBy: TagSorting;
	advanced: AdvancedConfig;
	views: ViewsConfig;
}

export enum FileAnnotationType {
	Blame = 'blame',
}

export interface AutolinkReference {
	prefix: string;
	url: string;
	title?: string;
	alphanumeric?: boolean;
	ignoreCase?: boolean;
}

export enum BranchSorting {
	DateDesc = 'date:desc',
	DateAsc = 'date:asc',
	NameAsc = 'name:asc',
	NameDesc = 'name:desc',
}

export enum ContributorSorting {
	CountDesc = 'count:desc',
	CountAsc = 'count:asc',
	DateDesc = 'date:desc',
	DateAsc = 'date:asc',
	NameAsc = 'name:asc',
	NameDesc = 'name:desc',
}

export enum CustomRemoteType {
	AzureDevOps = 'AzureDevOps',
	Bitbucket = 'Bitbucket',
	BitbucketServer = 'BitbucketServer',
	Custom = 'Custom',
	Gerrit = 'Gerrit',
	Gitea = 'Gitea',
	GitHub = 'GitHub',
	GitLab = 'GitLab',
}

export enum DateSource {
	Authored = 'authored',
	Committed = 'committed',
}

export enum DateStyle {
	Absolute = 'absolute',
	Relative = 'relative',
}

export enum GitCommandSorting {
	Name = 'name',
	Usage = 'usage',
}

export enum GravatarDefaultStyle {
	Faces = 'wavatar',
	Geometric = 'identicon',
	Monster = 'monsterid',
	MysteryPerson = 'mp',
	Retro = 'retro',
	Robot = 'robohash',
}

export enum TagSorting {
	DateDesc = 'date:desc',
	DateAsc = 'date:asc',
	NameAsc = 'name:asc',
	NameDesc = 'name:desc',
}

export enum ViewFilesLayout {
	Auto = 'auto',
	List = 'list',
	Tree = 'tree',
}

export enum ViewShowBranchComparison {
	Branch = 'branch',
	Working = 'working',
}

export interface AdvancedConfig {
	abbreviatedShaLength: number;
	abbreviateShaOnCopy: boolean;
	blame: {
		customArguments: string[] | null;
		delayAfterEdit: number;
		sizeThresholdAfterEdit: number;
	};
	caching: {
		enabled: boolean;
	};
	commitOrdering: string | null;
	externalDiffTool: string | null;
	externalDirectoryDiffTool: string | null;
	fileHistoryFollowsRenames: boolean;
	fileHistoryShowAllBranches: boolean;
	maxListItems: number;
	maxSearchItems: number;
	messages: {
		suppressCommitHasNoPreviousCommitWarning: boolean;
		suppressCommitNotFoundWarning: boolean;
		suppressCreatePullRequestPrompt: boolean;
		suppressDebugLoggingWarning: boolean;
		suppressFileNotUnderSourceControlWarning: boolean;
		suppressGitDisabledWarning: boolean;
		suppressGitMissingWarning: boolean;
		suppressGitVersionWarning: boolean;
		suppressImproperWorkspaceCasingWarning: boolean;
		suppressLineUncommittedWarning: boolean;
		suppressNoRepositoryWarning: boolean;
		suppressRebaseSwitchToTextWarning: boolean;
	};
	quickPick: {
		closeOnFocusOut: boolean;
	};
	repositorySearchDepth: number;
	similarityThreshold: number | null;
}

export type RemotesConfig =
	| {
			domain: string;
			regex: null;
			name?: string;
			protocol?: string;
			type: CustomRemoteType;
			urls?: RemotesUrlsConfig;
	  }
	| {
			domain: null;
			regex: string;
			name?: string;
			protocol?: string;
			type: CustomRemoteType;
			urls?: RemotesUrlsConfig;
	  };

export interface RemotesUrlsConfig {
	repository: string;
	branches: string;
	branch: string;
	commit: string;
	comparison?: string;
	file: string;
	fileInBranch: string;
	fileInCommit: string;
	fileLine: string;
	fileRange: string;
}

export interface ViewsCommonConfig {
	defaultItemLimit: number;
	formats: {
		commits: {
			label: string;
			description: string;
		};
		files: {
			label: string;
			description: string;
		};
		stashes: {
			label: string;
			description: string;
		};
	};
	pageItemLimit: number;
	showRelativeDateMarkers: boolean;
}

export const viewsCommonConfigKeys: (keyof ViewsCommonConfig)[] = [
	'defaultItemLimit',
	'formats',
	'pageItemLimit',
	'showRelativeDateMarkers',
];

interface ViewsConfigs {
	searchAndCompare: SearchAndCompareViewConfig;
}

export type ViewsConfigKeys = keyof ViewsConfigs;
export const viewsConfigKeys: ViewsConfigKeys[] = ['searchAndCompare'];

export type ViewsConfig = ViewsCommonConfig & ViewsConfigs;

export type ViewConfig = SearchAndCompareViewConfig;

export interface SearchAndCompareViewConfig {
	avatars: boolean;
	files: ViewsFilesConfig;
	pullRequests: {
		enabled: boolean;
		showForCommits: boolean;
	};
}

export interface ViewsFilesConfig {
	compact: boolean;
	layout: ViewFilesLayout;
	threshold: number;
}
