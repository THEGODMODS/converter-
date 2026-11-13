import {describe,expect,it} from "vitest";
import {inferPesPlayerIdFromPath} from "../engine/player-id";

describe("PES player ID inference",()=>{
  it("finds the nearest numeric player folder in a Windows source path",()=>{
    expect(inferPesPlayerIdFromPath("D:\\PES2021\\download\\Asset\\model\\character\\face\\real\\79205\\#Win")).toBe("79205");
  });
  it("finds a six-digit player folder in a POSIX source path",()=>{
    expect(inferPesPlayerIdFromPath("/mods/faces/176104/face")).toBe("176104");
  });
  it("does not guess an ID when the source path has no numeric player-ID segment",()=>{
    expect(inferPesPlayerIdFromPath("D:\\Mods\\My Face Pack")).toBeNull();
  });
});
