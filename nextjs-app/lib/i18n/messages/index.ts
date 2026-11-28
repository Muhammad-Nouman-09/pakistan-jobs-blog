// One module per area, each exporting { en, ur } flat dictionaries. Modules are independent files so
// areas can be translated/reviewed separately. Add a new module here after creating its file.
import type { Locale } from "../config";
import { common } from "./common";
import { publicSite } from "./public";
import { auth } from "./auth";
import { candidate } from "./candidate";
import { employer } from "./employer";
import { admin } from "./admin";
import { errors } from "./errors";
import { jobform } from "./jobform";
import { content } from "./content";

export type MessageModule = Record<Locale, Record<string, string>>;
export const modules: MessageModule[] = [common, publicSite, auth, candidate, employer, admin, errors, jobform, content];
