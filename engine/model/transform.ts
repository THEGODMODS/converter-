/** Explicit 4x4 column-major affine math for rig retargeting.
 * Matrices are never inferred from opaque PES byte layouts here: adapters must
 * decode a verified source convention before calling these functions.
 */
export type Mat4=readonly [number,number,number,number,number,number,number,number,number,number,number,number,number,number,number,number];
export type Vec3=[number,number,number];
const EPSILON=1e-10;
function assertMatrix(m:readonly number[],label="matrix"):void{if(m.length!==16||m.some(v=>!Number.isFinite(v)))throw new Error(label+" must contain exactly 16 finite values.");}
export function identity4():Mat4{return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
export function multiply4(a:Mat4,b:Mat4):Mat4{assertMatrix(a,"left matrix");assertMatrix(b,"right matrix");const out=new Array<number>(16).fill(0);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];return out as unknown as Mat4;}
export function invert4(m:Mat4):Mat4{assertMatrix(m);const a=Array.from({length:4},(_,row)=>[...Array.from({length:4},(_,col)=>m[col*4+row]),...Array.from({length:4},(_,col)=>row===col?1:0)]);for(let col=0;col<4;col++){let pivot=col;for(let row=col+1;row<4;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;if(Math.abs(a[pivot][col])<EPSILON)throw new Error("Cannot invert a singular bind-pose matrix.");[a[col],a[pivot]]=[a[pivot],a[col]];const divisor=a[col][col];for(let j=0;j<8;j++)a[col][j]/=divisor;for(let row=0;row<4;row++){if(row===col)continue;const factor=a[row][col];for(let j=0;j<8;j++)a[row][j]-=factor*a[col][j];}}const out=new Array<number>(16);for(let row=0;row<4;row++)for(let col=0;col<4;col++)out[col*4+row]=a[row][col+4];return out as unknown as Mat4;}
export function transformPoint4(m:Mat4,p:Vec3):Vec3{assertMatrix(m);if(p.some(v=>!Number.isFinite(v)))throw new Error("Point must contain finite coordinates.");const x=p[0],y=p[1],z=p[2],w=m[3]*x+m[7]*y+m[11]*z+m[15];if(Math.abs(w)<EPSILON)throw new Error("Point transform produced a zero homogeneous coordinate.");return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w];}
export function transformDirection4(m:Mat4,v:Vec3):Vec3{assertMatrix(m);return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2],m[1]*v[0]+m[5]*v[1]+m[9]*v[2],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]];}
/** Converts source bind-space positions into the corresponding target bind space. */
export function computeBindPoseRetargetMatrix(sourceBindWorld:Mat4,targetBindWorld:Mat4):Mat4{return multiply4(targetBindWorld,invert4(sourceBindWorld));}
export function normalize3(v:Vec3):Vec3{const length=Math.hypot(...v);if(!Number.isFinite(length)||length<EPSILON)throw new Error("Cannot normalize a zero-length or invalid vector.");return [v[0]/length,v[1]/length,v[2]/length];}
/** Correct normal transform for affine transforms: inverse-transpose of the linear part. */
export function transformNormal4(m:Mat4,n:Vec3):Vec3{const inv=invert4(m);return normalize3([inv[0]*n[0]+inv[1]*n[1]+inv[2]*n[2],inv[4]*n[0]+inv[5]*n[1]+inv[6]*n[2],inv[8]*n[0]+inv[9]*n[1]+inv[10]*n[2]]);}

export type BoneRetargetTransform={sourceIndex:number;targetIndex:number;matrix:Mat4};
/** Build explicit per-bone source-bind-world → target-bind-world transforms.
 * The caller must provide decoded, convention-normalized world bind matrices.
 */
export function buildBoneRetargetTransforms(sourceBindWorld:readonly Mat4[],targetBindWorld:readonly Mat4[],pairs:readonly {sourceIndex:number;targetIndex:number}[]):BoneRetargetTransform[]{
 if(!sourceBindWorld.length||!targetBindWorld.length)throw new Error("Source and target bind-pose matrices are required.");
 const seenSource=new Set<number>(),seenTarget=new Set<number>();
 return pairs.map(pair=>{
  if(!Number.isInteger(pair.sourceIndex)||pair.sourceIndex<0||pair.sourceIndex>=sourceBindWorld.length)throw new Error("Bone map references a source bone outside the source skeleton.");
  if(!Number.isInteger(pair.targetIndex)||pair.targetIndex<0||pair.targetIndex>=targetBindWorld.length)throw new Error("Bone map references a target bone outside the target skeleton.");
  if(seenSource.has(pair.sourceIndex)||seenTarget.has(pair.targetIndex))throw new Error("Bone retarget map must be one-to-one; duplicate source or target mapping found.");
  seenSource.add(pair.sourceIndex);seenTarget.add(pair.targetIndex);
  return {sourceIndex:pair.sourceIndex,targetIndex:pair.targetIndex,matrix:computeBindPoseRetargetMatrix(sourceBindWorld[pair.sourceIndex],targetBindWorld[pair.targetIndex])};
 });
}
