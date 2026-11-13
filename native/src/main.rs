use std::{env, fs, path::{Path,PathBuf}, process};
use fmdl::{format::{FmdlFile,SklFile}, Model as FoxModel};
use pes_model::{format::{PreFoxModel,mtl::MaterialSet}, model::Model as PreFoxSemanticModel};
use model_convert::{convert, NativeModelBundle, Subject};
use fpk::FpkFile;
use ftex::{ColorSpace,dds_to_ftex,ftex_to_dds,info as ftex_info};

fn required(args:&[String], name:&str)->Result<String,String>{let i=args.iter().position(|x|x==name).ok_or_else(||format!("Missing required argument {name}"))?;args.get(i+1).cloned().ok_or_else(||format!("Missing value for {name}"))}
fn optional(args:&[String],name:&str)->Option<String>{args.iter().position(|x|x==name).and_then(|i|args.get(i+1)).cloned()}
fn write(path:&Path,bytes:&[u8])->Result<(),String>{if let Some(parent)=path.parent(){fs::create_dir_all(parent).map_err(|e|format!("Create output directory: {e}"))?;}fs::write(path,bytes).map_err(|e|format!("Write {}: {e}",path.display()))}
fn run()->Result<(),String>{
 let args:Vec<String>=env::args().collect();
 if args.get(1).map(String::as_str)==Some("convert-texture"){
  let input=PathBuf::from(required(&args,"--input")?);let output=PathBuf::from(required(&args,"--out")?);let direction=required(&args,"--direction")?;let color=match optional(&args,"--color-space").as_deref().unwrap_or("srgb"){"srgb"=>ColorSpace::Srgb,"linear"=>ColorSpace::Linear,"normal"=>ColorSpace::Normal,_=>return Err("Color space must be srgb, linear or normal".into())};let bytes=fs::read(&input).map_err(|e|format!("Read texture: {e}"))?;
  let result=match direction.as_str(){"ftex-to-dds"=>ftex_to_dds(&bytes).map_err(|e|format!("FTEX decode: {e}"))?,"dds-to-ftex"=>dds_to_ftex(&bytes,color).map_err(|e|format!("DDS encode: {e}"))?,_=>return Err("Texture direction must be ftex-to-dds or dds-to-ftex".into())};
  if direction=="ftex-to-dds"{let _=ftex_info(&bytes).map_err(|e|format!("FTEX validation: {e}"))?;}else{let _=ftex_info(&result).map_err(|e|format!("Generated FTEX validation: {e}"))?;}
  write(&output,&result)?;println!(r#"{"ok":true,"bytes":{}}"#,result.len());return Ok(());
 }
 if args.get(1).map(String::as_str)!=Some("convert-model"){return Err("Usage: face-forge-native convert-model ... | convert-texture --input FILE --direction ftex-to-dds|dds-to-ftex --color-space srgb|linear|normal --out FILE".into());}
 let source_format=required(&args,"--source-format")?;let target_text=required(&args,"--target")?;let model_path=PathBuf::from(required(&args,"--model")?);let out=PathBuf::from(required(&args,"--out")?);
 let target:u16=target_text.parse().map_err(|_|"Target must be 2017 or 2021".to_string())?;if target!=2017&&target!=2021{return Err("Target must be 2017 or 2021".into());}
 if !model_path.is_file(){return Err(format!("Source model does not exist: {}",model_path.display()));}
 let bytes=fs::read(&model_path).map_err(|e|format!("Read source model: {e}"))?;
 let bundle=match source_format.as_str(){
  "fpk"=>{if target!=2017{return Err("An FPK source is a PES 2021 Fox package; choose PES 2017 as target.".into());}let archive=FpkFile::read(&bytes).map_err(|e|format!("Decode FPK/FPKD package: {e}"))?;let candidates:Vec<_>=archive.entries().filter(|(name,_)|name.to_ascii_lowercase().ends_with(".fmdl")).collect();if candidates.len()!=1{return Err(format!("Expected exactly one FMDL model in this face FPK; found {}. Select a package with one face model or use direct FMDL input.",candidates.len()));}let (name,data)=candidates[0];let file=FmdlFile::read(data).map_err(|e|format!("Decode packaged FMDL {name}: {e}"))?;let model=FoxModel::from_file(&file).map_err(|e|format!("Resolve packaged FMDL references: {e}"))?;let skl_name=format!("{}.skl",name.trim_end_matches(".fmdl"));let skl=archive.get(&skl_name).map(|data|SklFile::read(data).map_err(|e|format!("Decode companion SKL {skl_name}: {e}"))).transpose()?;NativeModelBundle::Fox{model,skl}},
  "fmdl"=>{if target==2021{return Err("Source and target are both PES 2021; select the opposite target generation.".into());}let file=FmdlFile::read(&bytes).map_err(|e|format!("Decode FMDL: {e}"))?;let model=FoxModel::from_file(&file).map_err(|e|format!("Resolve FMDL references: {e}"))?;let skl=if let Some(p)=optional(&args,"--skeleton"){let data=fs::read(&p).map_err(|e|format!("Read SKL: {e}"))?;Some(SklFile::read(&data).map_err(|e|format!("Decode SKL: {e}"))?)}else{None};NativeModelBundle::Fox{model,skl}},
  "model"=>{if target==2017{return Err("Source and target are both PES 2017; select the opposite target generation.".into());}let file=PreFoxModel::read(&bytes).map_err(|e|format!("Decode MODEL: {e}"))?;let model=PreFoxSemanticModel::from_file(&file).map_err(|e|format!("Resolve MODEL geometry: {e}"))?;let mtl_path=optional(&args,"--material").ok_or("PES 2017 MODEL conversion requires its companion .mtl file")?;let mtl_bytes=fs::read(&mtl_path).map_err(|e|format!("Read MTL: {e}"))?;let mtl=MaterialSet::read(&mtl_bytes).map_err(|e|format!("Decode MTL: {e}"))?;NativeModelBundle::PreFox{model,mtl}},
  _=>return Err("--source-format must be fmdl, fpk or model".into())
 };
 let target_version=if target==2017{pes_version::PesVersion::Pes17}else{pes_version::PesVersion::Pes21};
 let converted=convert(bundle,target_version).map_err(|e|format!("Cross-generation conversion rejected: {e}"))?;
 fs::create_dir_all(&out).map_err(|e|format!("Create output folder: {e}"))?;
 let mut outputs=Vec::new();
 match converted.bundle{
  NativeModelBundle::PreFox{model,mtl}=>{let file=model.to_file().map_err(|e|format!("Encode PES 2017 MODEL: {e}"))?;let model_bytes=file.write().map_err(|e|format!("Serialize PES 2017 MODEL: {e}"))?;let mtl_bytes=mtl.write();let checked_model=PreFoxModel::read(&model_bytes).map_err(|e|format!("PES 2017 MODEL read-back failed: {e}"))?;PreFoxSemanticModel::from_file(&checked_model).map_err(|e|format!("PES 2017 MODEL semantic read-back failed: {e}"))?;MaterialSet::read(&mtl_bytes).map_err(|e|format!("PES 2017 MTL read-back failed: {e}"))?;write(&out.join("face.model"),&model_bytes)?;write(&out.join("face.mtl"),&mtl_bytes)?;outputs.push("face.model".to_string());outputs.push("face.mtl".to_string());},
  NativeModelBundle::Fox{model,skl}=>{let file=model.to_file().map_err(|e|format!("Encode PES 2021 FMDL: {e}"))?;let model_bytes=file.write();let checked_file=FmdlFile::read(&model_bytes).map_err(|e|format!("PES 2021 FMDL read-back failed: {e}"))?;FoxModel::from_file(&checked_file).map_err(|e|format!("PES 2021 FMDL semantic read-back failed: {e}"))?;let skl_bytes=skl.as_ref().map(SklFile::write);if let Some(bytes)=&skl_bytes{SklFile::read(bytes).map_err(|e|format!("PES 2021 SKL read-back failed: {e}"))?;}write(&out.join("face.fmdl"),&model_bytes)?;outputs.push("face.fmdl".to_string());if let Some(bytes)=skl_bytes{write(&out.join("face.skl"),&bytes)?;outputs.push("face.skl".to_string());}}
 }
 let findings:Vec<serde_json::Value>=converted.findings.iter().map(|finding|{
  let subject=match &finding.subject {Subject::Model=>serde_json::json!({"type":"model"}),Subject::Mesh(index)=>serde_json::json!({"type":"mesh","index":index}),Subject::Material(index)=>serde_json::json!({"type":"material","index":index}),Subject::Bone(index)=>serde_json::json!({"type":"bone","index":index})};
  serde_json::json!({"code":finding.code,"subject":subject,"detail":&finding.detail})
 }).collect();
 let report=serde_json::json!({"ok":true,"target":target,"outputs":outputs,"findings":findings});
 println!("{}",report);
 Ok(())
}
fn main(){if let Err(error)=run(){eprintln!("FACE_FORGE_CONVERSION_ERROR: {error}");process::exit(2);}}
