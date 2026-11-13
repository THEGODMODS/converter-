use cpk::CpkArchive;
use serde_json::{Value,json};
use std::collections::HashSet;
use std::fs::{self,File};
use std::path::{Component,Path,PathBuf};
const MAX_ENTRIES:usize=100_000;
const MAX_EXTRACTED_BYTES:u64=1024*1024*1024;
fn safe_relative_path(raw:&str)->Result<PathBuf,String>{
 let normalized=raw.replace('\\',"/");
 let trimmed=normalized.strip_prefix('/').unwrap_or(&normalized);
 if trimmed.is_empty()||trimmed.starts_with('/') {return Err(format!("Unsafe absolute or empty CPK entry path: {raw}"));}
 let mut result=PathBuf::new();
 for segment in trimmed.split('/') {
  if segment.is_empty()||segment=="."||segment==".."||segment.ends_with('.')||segment.ends_with(' ')||
   segment.chars().any(|c|matches!(c,':'|'<'|'>'|'"'|'|'|'?'|'*'|'\\'|'\0')) {
   return Err(format!("Unsafe CPK entry path: {raw}"));
  }
  let device=segment.split('.').next().unwrap_or("").to_ascii_uppercase();
  let numbered=device.strip_prefix("COM").or_else(||device.strip_prefix("LPT")).and_then(|n|n.parse::<u8>().ok()).is_some_and(|n|(1..=9).contains(&n));
  if matches!(device.as_str(),"CON"|"PRN"|"AUX"|"NUL")||numbered{return Err(format!("Windows-reserved CPK entry path: {raw}"));}
  result.push(segment);
 }
 if result.is_absolute()||result.components().any(|component|!matches!(component,Component::Normal(_))){return Err(format!("Unsafe CPK entry path: {raw}"));}
 Ok(result)
}
fn prefix_matches(path:&str,prefix:&str)->bool{
 let path=path.to_ascii_lowercase();let prefix=prefix.replace('\\',"/").trim_matches('/').to_ascii_lowercase();
 !prefix.is_empty()&&(path==prefix||path.starts_with(&(prefix+"/")))
}
pub fn extract_cpk_archive(input:&Path,output:&Path,prefixes:&[String])->Result<Value,String>{
 if let Ok(metadata)=fs::symlink_metadata(output){
  if metadata.file_type().is_symlink()||!metadata.is_dir(){return Err("CPK extraction output must be a real directory.".into());}
  if fs::read_dir(output).map_err(|e|format!("Read extraction output: {e}"))?.next().is_some(){return Err("CPK extraction output directory must be empty.".into());}
 }else{fs::create_dir_all(output).map_err(|e|format!("Create extraction output: {e}"))?;}
 let mut archive=CpkArchive::open(File::open(input).map_err(|e|format!("Open CPK: {e}"))?).map_err(|e|format!("Read CPK index: {e}"))?;
 let entries=archive.entries().to_vec();
 if entries.len()>MAX_ENTRIES{return Err(format!("CPK has {} entries; safety limit is {MAX_ENTRIES}.",entries.len()));}
 let mut seen=HashSet::new();let mut files=0usize;let mut total_bytes=0u64;
 for entry in entries{
  let relative=safe_relative_path(&entry.path)?;
  let relative_text=relative.to_string_lossy().replace('\\',"/");
  if !seen.insert(relative_text.to_ascii_lowercase()){return Err(format!("CPK contains a duplicate case-insensitive path: {relative_text}"));}
  if !prefixes.is_empty()&&!prefixes.iter().any(|prefix|prefix_matches(&relative_text,prefix)){continue;}
  if entry.size as u64>MAX_EXTRACTED_BYTES||total_bytes.saturating_add(entry.size as u64)>MAX_EXTRACTED_BYTES{return Err("CPK selected entries exceed the 1 GiB extraction safety limit.".into());}
  let data=archive.read(&entry).map_err(|e|format!("Extract CPK entry {}: {e}",entry.path))?;
  if data.len()!=entry.size as usize{return Err(format!("CPK entry {} uses an unsupported compression method or has an invalid extracted size.",entry.path));}
  let destination=output.join(&relative);
  if !destination.starts_with(output){return Err(format!("CPK entry escapes extraction root: {}",entry.path));}
  fs::create_dir_all(destination.parent().ok_or_else(||"CPK entry has no parent directory.".to_string())?).map_err(|e|format!("Create CPK entry directory: {e}"))?;
  fs::write(&destination,&data).map_err(|e|format!("Write CPK entry {}: {e}",entry.path))?;
  total_bytes+=data.len() as u64;files+=1;
 }
 Ok(json!({"ok":true,"files":files,"bytes":total_bytes,"totalEntries":seen.len(),"prefixFiltered":!prefixes.is_empty()}))
}
#[cfg(test)]
mod tests{
 use super::*;
 use cpk::CpkWriter;
 use std::io::Cursor;
 use std::time::{SystemTime,UNIX_EPOCH};
 fn temp_root()->PathBuf{let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();let p=std::env::temp_dir().join(format!("face-forge-cpk-{}-{nonce}",std::process::id()));fs::create_dir_all(&p).unwrap();p}
 #[test]
 fn extracts_only_the_requested_player_prefix(){
  let root=temp_root();let archive_path=root.join("input.cpk");let output=root.join("out");
  let mut writer=CpkWriter::new(Cursor::new(Vec::new()),"FACE FORGE TEST").unwrap();
  writer.add("/common/character0/model/character/face/real/12345/#Win/face_high_win32.model",b"player-12345",None).unwrap();
  writer.add("/common/character0/model/character/face/real/67890/#Win/face_high_win32.model",b"player-67890",None).unwrap();
  fs::write(&archive_path,writer.finish().unwrap().into_inner()).unwrap();fs::create_dir_all(&output).unwrap();
  let report=extract_cpk_archive(&archive_path,&output,&["common/character0/model/character/face/real/12345".into()]).unwrap();
  assert_eq!(report["files"],json!(1));
  assert_eq!(fs::read(output.join("common/character0/model/character/face/real/12345/#Win/face_high_win32.model")).unwrap(),b"player-12345");
  assert!(!output.join("common/character0/model/character/face/real/67890/#Win/face_high_win32.model").exists());
  fs::remove_dir_all(root).unwrap();
 }
 #[test]
 fn rejects_parent_traversal_before_writing_outside_the_root(){
  let root=temp_root();let archive_path=root.join("bad.cpk");let output=root.join("out");
  let mut writer=CpkWriter::new(Cursor::new(Vec::new()),"FACE FORGE TEST").unwrap();
  writer.add("../escape.txt",b"no",None).unwrap();
  fs::write(&archive_path,writer.finish().unwrap().into_inner()).unwrap();fs::create_dir_all(&output).unwrap();
  assert!(extract_cpk_archive(&archive_path,&output,&[]).is_err());
  assert!(!root.join("escape.txt").exists());fs::remove_dir_all(root).unwrap();
 }
}
