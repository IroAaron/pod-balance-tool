import type { Build } from "../models/Build";

export type BuildSortKey = "name" | "itemCount";

export class BuildService {

    search(builds: Build[], query: string): Build[] {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return builds;

        return builds.filter(
            (build) => build.name.toLowerCase().includes(normalized) || build.id.toLowerCase().includes(normalized)
        );
    }

    sort(builds: Build[], key: BuildSortKey): Build[] {
        const sorted = [...builds];

        sorted.sort((a, b) => {
            if (key === "itemCount") return b.items.length - a.items.length;
            return a.name.localeCompare(b.name);
        });

        return sorted;
    }

}
