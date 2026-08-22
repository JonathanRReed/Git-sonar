import type { RepoGraph } from '@lib/git/types';

interface DemoDatasetLoader {
    load: () => Promise<RepoGraph>;
}

const DEMO_DATASET_LOADERS: Record<string, DemoDatasetLoader> = {
    simple: {
        async load() {
            const response = await fetch('/data/simple.json');
            if (!response.ok) throw new Error('Failed to load simple demo data');
            const data = await response.json();
            const { importLocalExport } = await import('@lib/git/import-local');
            return importLocalExport(JSON.stringify(data));
        },
    },
    branching: {
        async load() {
            const response = await fetch('/data/branching.json');
            if (!response.ok) throw new Error('Failed to load branching demo data');
            const data = await response.json();
            const { importLocalExport } = await import('@lib/git/import-local');
            return importLocalExport(JSON.stringify(data));
        },
    },
    complex: {
        async load() {
            const response = await fetch('/data/complex.json');
            if (!response.ok) throw new Error('Failed to load complex demo data');
            const data = await response.json();
            const { importLocalExport } = await import('@lib/git/import-local');
            return importLocalExport(JSON.stringify(data));
        },
    },
};

export { getDemoDatasets } from './catalog';

export async function loadDemoDataset(key: string): Promise<RepoGraph> {
    const dataset = DEMO_DATASET_LOADERS[key];
    if (!dataset) {
        throw new Error(`Demo dataset "${key}" not found`);
    }

    return dataset.load();
}
