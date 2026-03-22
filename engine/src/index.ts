import dotenv from "dotenv";
dotenv.config();

import { analyzeFingerprint } from "./fingerprint";
import { analyzeFilesystem } from "./filesystem";
import { parseRepo } from "./parser";

const repoPath = process.cwd();        

const fingerprint = analyzeFingerprint(repoPath);
console.log("Fingerprint:", JSON.stringify(fingerprint, null, 2));

const routes = analyzeFilesystem(repoPath, fingerprint);
console.log("Routes found:", routes.length);

const parserResult = parseRepo(repoPath);
console.log("Parser stats:", JSON.stringify(parserResult.stats, null, 2));