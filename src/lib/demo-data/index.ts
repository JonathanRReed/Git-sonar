import type { RepoGraph } from '@lib/git/types';
import type { ReactNode } from 'react';

interface DemoDataset {
    name: string;
    description: string;
    iconName: 'file-text' | 'git-branch' | 'network';
    load: () => Promise<RepoGraph>;
}

const DEMO_DATASETS: Record<string, DemoDataset> = {
    simple: {
        name: 'Simple',
        description: 'Linear history, perfect for beginners',
        iconName: 'file-text',
        async load() {
            const response = await fetch('/data/simple.json');
            if (!response.ok) throw new Error('Failed to load simple demo data');
            const data = await response.json();
            const { importLocalExport } = await import('@lib/git/import-local');
            return importLocalExport(JSON.stringify(data));
        },
    },
    branching: {
        name: 'Branching',
        description: 'Multiple feature branches merging into main',
        iconName: 'git-branch',
        async load() {
            const response = await fetch('/data/branching.json');
            if (!response.ok) throw new Error('Failed to load branching demo data');
            const data = await response.json();
            const { importLocalExport } = await import('@lib/git/import-local');
            return importLocalExport(JSON.stringify(data));
        },
    },
    complex: {
        name: 'Complex',
        description: 'Multiple features and bugfix branches',
        iconName: 'network',
        async load() {
            const response = await fetch('/data/complex.json');
            if (!response.ok) throw new Error('Failed to load complex demo data');
            const data = await response.json();
            const { importLocalExport } = await import('@lib/git/import-local');
            return importLocalExport(JSON.stringify(data));
        },
    },
};

export function getDemoDatasets() {
    return DEMO_DATASETS;
}

export async function loadDemoDataset(key: string): Promise<RepoGraph> {
    const dataset = DEMO_DATASETS[key];
    if (!dataset) {
        throw new Error(`Demo dataset "${key}" not found`);
    }
    return dataset.load();
}
