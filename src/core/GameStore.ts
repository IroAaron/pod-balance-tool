import type { Item } from "./models/Item";
import type { Build } from "./models/Build";

import { ItemService } from "./services/ItemService";
import { BuildService } from "./services/BuildService";
import { GraphService } from "./services/GraphService";
import { ImportService } from "./services/ImportService";

export class GameStore {

    items: Item[] = [];

    builds: Build[] = [];

    readonly itemService = new ItemService();

    readonly buildService = new BuildService();

    readonly graphService = new GraphService();

    readonly importService = new ImportService();

}