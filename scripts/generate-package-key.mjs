#!/usr/bin/env node
import {generateKeyPairSync} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
const [keyId,directory]=process.argv.slice(2);
if(!keyId||!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)||!directory){process.stderr.write("Usage: node scripts/generate-package-key.mjs <key-id> <secure-output-directory>\n");process.exit(2);}
const target=path.resolve(directory);await mkdir(target,{recursive:true});
const pair=generateKeyPairSync("ed25519",{privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
const privatePath=path.join(target,keyId+".private.pem"),publicPath=path.join(target,keyId+".public.pem");
await writeFile(privatePath,pair.privateKey,{flag:"wx",mode:0o600});
await writeFile(publicPath,pair.publicKey,{flag:"wx",mode:0o644});
process.stdout.write("Created Ed25519 key pair.\nPrivate key (keep offline): "+privatePath+"\nPublic key (provision in app): "+publicPath+"\n");
