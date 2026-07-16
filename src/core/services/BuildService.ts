import type { Build } from "../models/Build";

export class BuildService {

    search(items: Build[], query: string): Build[] {

        return items.filter(item =>
            item.name.toLowerCase().includes(query.toLowerCase())
        );

    }

}