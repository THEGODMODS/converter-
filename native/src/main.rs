use std::{env, fs, path::{Path,PathBuf}, process};
mod package_policy;
use package_policy::{ftex_target_path, normalize_fox_virtual_path, validate_face_package_members};
use fmdl::{format::{FmdlFile,SklFile}, Model as FoxModel};
use pes_model::{format::{PreFoxModel,mtl::MaterialSet}, model::Model as PreFoxSemanticModel};
use model_convert::{convert, NativeModelBundle, Subject};
use fpk::FpkFile;
use wezlib::decompress_if_wrapped;
use ftex::{ColorSpace,dds_to_ftex,ftex_to_dds,info as ftex_info};

fn required(args:&[String], name:&str)->Result<String,String>{let i=args.iter().position(|x|x==name).ok_or_else(||format!("Missing required argument {name}"))?;args.get(i+1).cloned().ok_or_else(||format!("Missing value for {name}"))}
fn optional(args:&[String],name:&str)->Option<String>{args.iter().position(|x|x==name).and_then(|i|args.get(i+1)).cloned()}
fn write(path:&Path,bytes:&[u8])->Result<(),String>{if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|format!("Create output directory: {e}"))?;}fs::write(path,bytes).map_err(|e|format!("Write {}: {e}",path.display()))}
fn replace_texture_extension(value:&mut String,from:&str,to:&str)->Result<(),String>{
 let (stem,extension)=value.rsplit_once('.').ok_or_else(||format!("Texture reference has no file extension: {value}"))?;
 if !extension.eq_ignore_ascii_case(from){return Err(format!("Texture reference has unexpected source extension: {value} (expected .{from})"));}
 *value=format!("{stem}.{to}");Ok(())
}
fn run()->Result<(),String>{
 let args:Vec<String>=env::args().collect();
 if args.get(1).map(String::as_str)==Some("convert-texture"){
  let input=PathBuf::from(required(&args,"--input")?);let output=PathBuf::from(required(&args,"--out")?);let direction=required(&args,"--direction")?;let color=match optional(&args,"--color-space").as_deref().unwrap_or("srgb"){"srgb"=>ColorSpace::Srgb,"linear"=>ColorSpace::Linear,"normal"=>ColorSpace::Normal,_=>return Err("Color space must be srgb, linear or normal".into())};let bytes=fs::read(&input).map_err(|e|format!("Read texture: {e}"))?;
  let result=match direction.as_str(){"ftex-to-dds"=>ftex_to_dds(&bytes).map_err(|e|format!("FTEX decode: {e}"))?,"dds-to-ftex"=>dds_to_ftex(&bytes,color).map_err(|e|format!("DDS encode: {e}"))?,_=>return Err("Texture direction must be ftex-to-dds or dds-to-ftex".into())};
  if direction=="ftex-to-dds"{let _=ftex_info(&bytes).map_err(|e|format!("FTEX validation: {e}"))?;}else{let _=ftex_info(&result).map_err(|e|format!("Generated FTEX validation: {e}"))?;}
  write(&output,&result)?;println!("{}",serde_json::json!({"ok":true,"bytes":result.len()}));return Ok(());
 }
 if args.get(1).map(String::as_str)!=Some("convert-model"){return Err("Usage: face-forge-native convert-model ... | convert-texture --input FILE --direction ftex-to-dds|dds-to-ftex --color-space srgb|linear|normal --out FILE".into());}
 let source_format=required(&args,"--source-format")?;let target_text=required(&args,"--target")?;let out=PathBuf::from(required(&args,"--out")?);
 let model_paths:Vec<PathBuf>=args.iter().enumerate().filter(|(_,arg)|arg.as_str()=="--model").filter_map(|(i,_)|args.get(i+1)).map(PathBuf::from).collect();
 if model_paths.is_empty(){return Err("At least one --model input is required.".into());}
 let target:u16=target_text.parse().map_err(|_|"Target must be 2017 or 2021".to_string())?;if target!=2017&&target!=2021{return Err("Target must be 2017 or 2021".into());}
 for path in &model_paths{if !path.is_file(){return Err(format!("Source model does not exist: {}",path.display()));}}
 if source_format=="fpk"&&(model_paths.is_empty()||model_paths.len()>2){return Err("Supply one face FPK and optionally its paired FPKD archive.".into());}
 let textures_managed_externally=args.iter().any(|arg|arg=="--textures-managed-externally");
 let mut package_textures:Vec<(String,Vec<u8>)>=Vec::new();
 let bundles:Vec<(String,NativeModelBundle)>=match source_format.as_str(){
  "fpk"=>{
   if target!=2017{return Err("A PES 2021 Fox package source must target PES 2017.".into());}
   let mut archive_entries:Vec<(String,Vec<u8>)>=Vec::new();let mut seen=std::collections::HashSet::new();
   for archive_path in &model_paths{
    let bytes=fs::read(archive_path).map_err(|e|format!("Read source Fox archive {}: {e}",archive_path.display()))?;
    let archive=FpkFile::read(&bytes).map_err(|e|format!("Decode source FPK/FPKD {}: {e}",archive_path.display()))?;
    for (name,data) in archive.entries(){
     let normalized=normalize_fox_virtual_path(name)?;
     if !seen.insert(normalized.to_ascii_lowercase()){return Err(format!("The paired FPK/FPKD archives contain a duplicate virtual path: {normalized}"));}
     archive_entries.push((normalized,data.to_vec()));
    }
   }
   // Validate every member before conversion. In particular, do not accept
   // FTEX merely because a standalone texture command exists: this package
   // path must emit/relink every accepted member or reject the whole package.
   let member_names:Vec<String>=archive_entries.iter().map(|(name,_)|name.clone()).collect();
   validate_face_package_members(&member_names)?;
   package_textures=archive_entries.iter().filter(|(name,_)|name.to_ascii_lowercase().ends_with(".ftex")).map(|(name,data)|(name.clone(),data.clone())).collect();
   let candidates:Vec<_>=archive_entries.iter().filter(|(name,_)|name.to_ascii_lowercase().ends_with(".fmdl")).collect();
   if candidates.is_empty(){return Err("Neither the FPK nor its paired FPKD contains an FMDL model.".into());}
   let mut names=std::collections::HashSet::new();let mut converted=Vec::new();
   for (name,data) in candidates{
    let file_name=name.rsplit('/').next().unwrap_or(name);let stem=file_name.rsplit_once('.').map(|x|x.0).unwrap_or(file_name);
    if stem.is_empty()||!stem.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'){return Err(format!("Unsafe or unsupported model name in Fox archive: {name}"));}
    if !names.insert(stem.to_ascii_lowercase()){return Err(format!("Multiple archive models collapse to the same output name: {stem}"));}
    let skl_name=format!("{}.skl",&name[..name.len()-5]);
    let file=FmdlFile::read(data).map_err(|e|format!("Decode packaged FMDL {name}: {e}"))?;
    let model=FoxModel::from_file(&file).map_err(|e|format!("Resolve packaged FMDL references {name}: {e}"))?;
    let skl_bytes=archive_entries.iter().find(|(candidate,_)|candidate.eq_ignore_ascii_case(&skl_name)).map(|(_,bytes)|bytes);
    let skl=skl_bytes.map(|bytes|SklFile::read(bytes).map_err(|e|format!("Decode companion SKL {skl_name}: {e}"))).transpose()?;
    converted.push((stem.to_owned(),NativeModelBundle::Fox{model,skl}));
   }converted
  },
  "fmdl"=>{
   if target==2021{return Err("Source and target are both PES 2021; select PES 2017 as target.".into());}
   let mut converted=Vec::new();
   for model_path in &model_paths{
    let bytes=fs::read(model_path).map_err(|e|format!("Read FMDL {}: {e}",model_path.display()))?;
    let file=FmdlFile::read(&bytes).map_err(|e|format!("Decode FMDL {}: {e}",model_path.display()))?;
    let model=FoxModel::from_file(&file).map_err(|e|format!("Resolve FMDL references {}: {e}",model_path.display()))?;
    let skl_path=model_path.with_extension("skl");
    let skl=if skl_path.exists(){let data=fs::read(&skl_path).map_err(|e|format!("Read SKL: {e}"))?;Some(SklFile::read(&data).map_err(|e|format!("Decode SKL: {e}"))?)}else{None};
    let stem=model_path.file_stem().and_then(|x|x.to_str()).ok_or("Invalid FMDL file name")?.to_owned();
    converted.push((stem,NativeModelBundle::Fox{model,skl}));
   }converted
  },
  "model"=>{
   if target==2017{return Err("Source and target are both PES 2017; select PES 2021 as target.".into());}
   let mut converted=Vec::new();
   for model_path in &model_paths{
    let bytes=fs::read(model_path).map_err(|e|format!("Read MODEL {}: {e}",model_path.display()))?;
    let model_payload=decompress_if_wrapped(&bytes).map_err(|e|format!("Decode WESYS wrapper {}: {e}",model_path.display()))?;
    let file=PreFoxModel::read(&model_payload).map_err(|e|format!("Decode MODEL {}: {e}",model_path.display()))?;
    let model=PreFoxSemanticModel::from_file(&file).map_err(|e|format!("Resolve MODEL geometry {}: {e}",model_path.display()))?;
    let mtl_path=model_path.with_extension("mtl");
    if !mtl_path.is_file(){return Err(format!("PES 2017 MODEL {} requires its companion .mtl file",model_path.display()));}
    let mtl_bytes=fs::read(&mtl_path).map_err(|e|format!("Read MTL: {e}"))?;
    let mtl=MaterialSet::read(&mtl_bytes).map_err(|e|format!("Decode MTL: {e}"))?;
    let stem=model_path.file_stem().and_then(|x|x.to_str()).ok_or("Invalid MODEL file name")?.to_owned();
    converted.push((stem,NativeModelBundle::PreFox{model,mtl}));
   }converted
  },
  _=>return Err("--source-format must be fmdl, fpk or model".into())
 };
 if bundles.is_empty(){return Err("No convertible models were discovered.".into());}
 let mut output_names=std::collections::HashSet::new();
 for (stem,_) in &bundles{if stem.is_empty()||!stem.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'||c=='-'){return Err(format!("Unsafe output model stem: {stem}"));}if !output_names.insert(stem.to_ascii_lowercase()){return Err(format!("Duplicate output model stem: {stem}"));}}
 let target_version=if target==2017{pes_version::PesVersion::Pes17}else{pes_version::PesVersion::Pes21};
 fs::create_dir_all(&out).map_err(|e|format!("Create output folder: {e}"))?;
 if fs::read_dir(&out).map_err(|e|format!("Read output folder: {e}"))?.next().is_some(){return Err("Output directory must be empty; no files were written.".into());}
 let model_count=bundles.len();let mut outputs=Vec::new();let mut pending_outputs:Vec<(String,Vec<u8>)>=Vec::new();let mut findings:Vec<serde_json::Value>=Vec::new();
 for (stem,bundle) in bundles{
  let mut converted=convert(bundle,target_version).map_err(|e|format!("Cross-generation conversion rejected for {stem}: {e}"))?;
  match &mut converted.bundle {
   NativeModelBundle::PreFox{mtl,..}=>{for material in &mut mtl.materials{for entry in &mut material.entries{if let pes_model::format::mtl::MaterialEntry::Sampler(sampler)=entry{replace_texture_extension(&mut sampler.path,"ftex","dds")?;}}}},
   NativeModelBundle::Fox{model,..}=>{for material in &mut model.materials{for (_,texture) in &mut material.textures{replace_texture_extension(&mut texture.file_name,"dds","ftex")?;}}}
  }
  for finding in &converted.findings{
   let subject=match &finding.subject {Subject::Model=>serde_json::json!({"type":"model"}),Subject::Mesh(index)=>serde_json::json!({"type":"mesh","index":index}),Subject::Material(index)=>serde_json::json!({"type":"material","index":index}),Subject::Bone(index)=>serde_json::json!({"type":"bone","index":index})};
   findings.push(serde_json::json!({"model":stem,"code":finding.code,"subject":subject,"detail":&finding.detail}));
  }
  match converted.bundle{
   NativeModelBundle::PreFox{model,mtl}=>{
    let file=model.to_file().map_err(|e|format!("Encode PES 2017 MODEL {stem}: {e}"))?;
    let model_bytes=file.write().map_err(|e|format!("Serialize PES 2017 MODEL {stem}: {e}"))?;
    let mtl_bytes=mtl.write();
    let checked_model=PreFoxModel::read(&model_bytes).map_err(|e|format!("PES 2017 MODEL read-back failed for {stem}: {e}"))?;
    PreFoxSemanticModel::from_file(&checked_model).map_err(|e|format!("PES 2017 MODEL semantic read-back failed for {stem}: {e}"))?;
    MaterialSet::read(&mtl_bytes).map_err(|e|format!("PES 2017 MTL read-back failed for {stem}: {e}"))?;
    pending_outputs.push((format!("{stem}.model"),model_bytes));pending_outputs.push((format!("{stem}.mtl"),mtl_bytes));
    outputs.push(format!("{stem}.model"));outputs.push(format!("{stem}.mtl"));
   },
   NativeModelBundle::Fox{model,skl}=>{
    let file=model.to_file().map_err(|e|format!("Encode PES 2021 FMDL {stem}: {e}"))?;let model_bytes=file.write();
    let checked_file=FmdlFile::read(&model_bytes).map_err(|e|format!("PES 2021 FMDL read-back failed for {stem}: {e}"))?;
    FoxModel::from_file(&checked_file).map_err(|e|format!("PES 2021 FMDL semantic read-back failed for {stem}: {e}"))?;
    let skl_bytes=skl.as_ref().map(SklFile::write);
    if let Some(bytes)=&skl_bytes{SklFile::read(bytes).map_err(|e|format!("PES 2021 SKL read-back failed for {stem}: {e}"))?;}
    pending_outputs.push((format!("{stem}.fmdl"),model_bytes));outputs.push(format!("{stem}.fmdl"));
    if let Some(bytes)=skl_bytes{pending_outputs.push((format!("{stem}.skl"),bytes));outputs.push(format!("{stem}.skl"));}
   }
  }
 }

 if !textures_managed_externally {
  // Convert every FTEX package member and preserve its virtual directory so
  // the already-rewritten material sampler path resolves in the target output.
  let mut output_paths:std::collections::HashSet<String>=outputs.iter().map(|p|p.to_ascii_lowercase()).collect();
  for (source_path,source_bytes) in &package_textures {
   let _=ftex_info(source_bytes).map_err(|e|format!("Validate packaged FTEX {source_path}: {e}"))?;
   let target_path=ftex_target_path(source_path)?;
   if !output_paths.insert(target_path.to_ascii_lowercase()) {
    return Err(format!("Package conversion produces a duplicate target path: {target_path}"));
   }
   let dds=ftex_to_dds(source_bytes).map_err(|e|format!("Convert packaged FTEX {source_path}: {e}"))?;
   if dds.len()<128 || &dds[..4]!=b"DDS " {
    return Err(format!("FTEX decoder produced an invalid DDS header for {source_path}"));
   }
   pending_outputs.push((target_path.clone(),dds));
   outputs.push(target_path);
  }
 
 }
 let stage=out.join(".faceforge-staging");fs::create_dir(&stage).map_err(|e|format!("Create staging directory: {e}"))?;
 for (name,data) in pending_outputs{if let Err(error)=write(&stage.join(&name),&data){let _=fs::remove_dir_all(&stage);return Err(error);}}
 let mut committed:Vec<PathBuf>=Vec::new();
 for name in &outputs{
  let from=stage.join(name);let to=out.join(name);
  if let Some(parent)=to.parent(){if let Err(error)=fs::create_dir_all(parent){for path in committed{let _=fs::remove_file(path);}let _=fs::remove_dir_all(&stage);return Err(format!("Create target output directory for {}: {error}",name));}}
  if let Err(error)=fs::rename(&from,&to){for path in committed{let _=fs::remove_file(path);}let _=fs::remove_dir_all(&stage);return Err(format!("Commit converted output {}: {error}",name));}
  committed.push(to);
 }
 let _=fs::remove_dir_all(&stage);
 let report=serde_json::json!({"ok":true,"target":target,"model_count":model_count,"outputs":outputs,"findings":findings});println!("{}",report);Ok(())
}
fn main(){if let Err(error)=run(){eprintln!("FACE_FORGE_CONVERSION_ERROR: {error}");process::exit(2);}}
