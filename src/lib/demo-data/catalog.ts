export interface DemoDatasetInfo {
    name: string;
    description: string;
    iconName: 'file-text' | 'git-branch' | 'network';
}

const DEMO_DATASETS: Record<string, DemoDatasetInfo> = {
    simple: {
        name: 'Simple',
        description: 'Linear history for a quick walkthrough',
        iconName: 'file-text',
    },
    branching: {
        name: 'Branching',
        description: 'Multiple feature branches merging into main',
        iconName: 'git-branch',
    },
    complex: {
        name: 'Complex',
        description: 'Multiple features and bugfix branches',
        iconName: 'network',
    },
};

export function getDemoDatasets() {
    return DEMO_DATASETS;
}
