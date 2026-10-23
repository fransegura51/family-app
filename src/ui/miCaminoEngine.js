// «Mi Camino» (Pequeños Grandes → Puntos y recompensas, modo Camino) — motor de dibujo del prototipo
// aprobado «PEPA_Mi_Camino_V32_Corregida.html», trasladado SIN rediseñar: mismos tres mundos (Pueblo de
// las Golosinas, Reino Submarino, Planeta Espacial), mismas animaciones de caminata, fauna, planetas y
// transiciones. Es JavaScript a propósito (con su .d.ts al lado): es dibujo de canvas del prototipo,
// ~650 líneas de funciones de trazo que se conservan tal cual para no alterar nada de lo aprobado; la
// lógica que sí decide algo (mundo, vuelta, empates) vive tipada y probada en domain/miCamino.ts.
//
// Lo que cambia respecto al prototipo, todo en la parte de datos/ciclo de vida (nunca en el arte):
//  - los niños y sus puntos llegan de fuera (setKids) en vez de dos niños fijos con botones de prueba;
//  - cualquier número de niños (los empates se escalonan con hooks.figureSlots);
//  - canvas con devicePixelRatio, un solo bucle de animación que se puede parar (start/stop/destroy),
//    limitado a ~60 pasos por segundo en pantallas de 120 Hz, y modo de movimiento reducido (un único
//    fotograma estático, sin bucle ni transiciones);
//  - las curiosidades de los planetas salen por hooks.onPlanet (las muestra un diálogo de React);
//  - la foto real del miembro se recorta dentro de la cabeza del muñeco (si no hay foto, la letra);
//  - se descartan los 24 fotogramas PNG en base64 (~100 KB) heredados de la carrera V6, que el prototipo
//    creaba pero nunca dibujaba (el muñeco de V32 se dibuja con trazos): no se cargan en cada móvil;
//  - durante una transición el niño y las etiquetas usan el valor real de puntos, así el cruce de
//    vuelta (449→450, 899→900…) no deja al niño fuera de cuadro ni etiquetas de la vuelta anterior.

export const PLANET_FACTS={
'Mercurio':['Es el planeta más cercano al Sol.','Su superficie está llena de cráteres.','Un año allí dura solo 88 días terrestres.'],
'Venus':['Está cubierto de nubes muy densas.','Es el planeta más caliente del sistema solar.','Gira en sentido contrario al de la Tierra.'],
'Tierra':['Es nuestro hogar y tiene océanos de agua líquida.','Tarda aproximadamente un año en dar la vuelta al Sol.','La Luna es su satélite natural.'],
'Marte':['Se conoce como el planeta rojo.','Tiene el volcán Olimpo, gigantesco.','Allí exploran robots enviados desde la Tierra.'],
'Júpiter':['Es el planeta más grande del sistema solar.','Tiene una enorme tormenta llamada Gran Mancha Roja.','Cuenta con muchas lunas.'],
'Saturno':['Sus anillos están hechos de hielo, polvo y rocas.','Es un gigante gaseoso.','Su luna Titán tiene lagos de metano.'],
'Urano':['Tiene un color azul verdoso por el metano.','Gira casi de lado.','Es uno de los planetas más fríos.'],
'Neptuno':['Es el planeta más alejado del Sol.','Tiene vientos extraordinariamente fuertes.','Su color azul se debe en parte al metano.'],
'Sol':['Es una estrella, no un planeta.','Su luz y calor hacen posible la vida en la Tierra.','Todos los planetas orbitan a su alrededor.']};

export function createMiCaminoEngine(canvas, hooks = {}, reducedMotion = false) {
const cv=canvas,c=cv.getContext('2d');const W=720,H=470;let dpr=1,firstSync=false;
if(!c.roundRect){c.roundRect=function(x,y,w,h,r){const rr=Math.min(Array.isArray(r)?r[0]:r,w/2,h/2);this.moveTo(x+rr,y);this.arcTo(x+w,y,x+w,y+h,rr);this.arcTo(x+w,y+h,x,y+h,rr);this.arcTo(x,y+h,x,y,rr);this.arcTo(x,y,x+w,y,rr);this.closePath()}}
const kids=[];let t=0,paused=!!reducedMotion,cam=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function path(points,color,width){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points();c.stroke()}
function ellipse(x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill()}
function round(x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill()}
function circle(x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()}
function line(x1,y1,x2,y2,col,w=3){c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()}
function text(s,x,y,size=16,col='#4b3657',weight=700){c.fillStyle=col;c.font=`${weight} ${size}px system-ui`;c.textAlign='center';c.fillText(s,x,y)}
const lollyPalettes=[['#ff8fae','#fff1a1','#d34f9a'],['#a4f0fb','#7056cc','#ffffff'],['#ffdc7b','#fa794f','#fff9e9'],['#a7e9a0','#f577ad','#fdf1a6'],['#d6b4ff','#ffcf68','#875bd2'],['#fa95e0','#6ed8cb','#fff4b8'],['#ffa579','#e7518c','#ffe7a8']];
function candy(x,y,scale=1,kind=0,variant=0){c.save();c.translate(x,y);c.scale(scale,scale);let pal=lollyPalettes[variant%lollyPalettes.length];line(0,0,0,85,'#fff4df',8);circle(0,0,kind===0?26:23,pal[0]);if(kind===0){for(let i=0;i<4;i++){c.beginPath();c.arc(0,0,22-i*5,-2.4+i*.45,1.8+i*.45);c.strokeStyle=pal[1+i%2];c.lineWidth=4;c.stroke()}}else{for(let i=0;i<7;i++)circle(Math.sin(i*2.4)*13,Math.cos(i*2.4)*13,4,pal[(i%2)+1])}c.restore()}
function house(x,y,scale=1){c.save();c.translate(x,y);c.scale(scale,scale);
 // Chocolate-bar walls with individually visible dark chocolate squares.
 round(-58,-86,116,98,8,'#4c261c');
 for(let row=0;row<4;row++)for(let col=0;col<4;col++){
  let bx=-53+col*27,by=-81+row*23;
  round(bx,by,24,20,3,'#70402a');round(bx+3,by+3,18,14,3,'#865037');
  line(bx+5,by+5,bx+18,by+5,'#a46a48',1.4);
 }
 // Whipped-cream roof: layered scalloped white cream and soft swirls.
 c.fillStyle='#fffdf5';c.beginPath();c.moveTo(-69,-83);c.quadraticCurveTo(-49,-109,-25,-124);c.quadraticCurveTo(-7,-143,0,-148);c.quadraticCurveTo(19,-133,38,-117);c.quadraticCurveTo(61,-99,69,-83);c.quadraticCurveTo(57,-70,45,-82);c.quadraticCurveTo(32,-67,18,-83);c.quadraticCurveTo(3,-66,-10,-83);c.quadraticCurveTo(-28,-67,-42,-84);c.quadraticCurveTo(-58,-69,-69,-83);c.fill();
 for(let i=0;i<5;i++)ellipse(-44+i*22,-92-Math.sin(i/4*Math.PI)*15,12,7,'#fffdf9');
 path(()=>{c.moveTo(-49,-88);c.quadraticCurveTo(-22,-113,0,-134);c.quadraticCurveTo(26,-115,51,-88)},'#e9d9ce',2);
 round(-15,-40,30,52,12,'#b67b4c');round(-10,-37,20,48,9,'#623522');circle(6,-12,2.5,'#ffd57d');
 circle(-32,-44,10,'#f4c6a7');circle(32,-44,10,'#f4c6a7');wrappedCandy(0,-151,.35,-.08);c.restore()}
function sweetHill(x,y,rx,ry,color){ellipse(x,y,rx,ry,color);ellipse(x-20,y-ry*.38,rx*.25,ry*.16,'#fff0f3')}
function wrappedCandy(x,y,scale=1,rotation=0){
 c.save();c.translate(x,y);c.rotate(rotation);c.scale(scale,scale);
 c.fillStyle='#f7c5f2';c.strokeStyle='#b64a99';c.lineWidth=2;
 c.beginPath();c.moveTo(-18,-12);c.lineTo(-34,-19);c.lineTo(-29,0);c.lineTo(-34,19);c.lineTo(-18,12);c.closePath();c.fill();c.stroke();
 c.beginPath();c.moveTo(18,-12);c.lineTo(34,-19);c.lineTo(29,0);c.lineTo(34,19);c.lineTo(18,12);c.closePath();c.fill();c.stroke();
 round(-21,-15,42,30,13,'#ffdc67');
 for(let i=-12;i<=12;i+=12)line(i,-12,i+7,12,['#ff7a9c','#9b7cf0','#57d2db'][((i+12)/12)%3],6);
 c.restore();
}
// Decoration drawn in three depth bands: distant objects are smaller and move slower.
function gummyBear(x,y,scale,color){
 c.save();c.translate(x,y);c.scale(scale,scale);
 const shadow='#594567';ellipse(0,12,10,2.5,'#ffffff55');
 circle(-9,-14,5,color);circle(9,-14,5,color);
 circle(0,-8,11,color);ellipse(0,9,12,14,color);
 ellipse(-10,19,5,6,color);ellipse(10,19,5,6,color);
 ellipse(-13,5,5,8,color);ellipse(13,5,5,8,color);
 ellipse(-3,-10,2,2,'#ffffffbb');circle(-4,-9,1.2,shadow);circle(4,-9,1.2,shadow);
 ellipse(0,-3,3,2,'#ffe9f5');ellipse(-4,5,4,7,'#ffffff33');
 c.restore();
}
function candyFlower(x,y,scale,kind){
 c.save();c.translate(x,y);c.scale(scale,scale);
 line(0,0,0,-17,'#ffd452',2.6);
 if(kind===0){
  // Small wrapped red sweet, with unmistakable twisted ends.
  c.fillStyle='#ff9ab3';c.beginPath();c.moveTo(-9,-20);c.lineTo(-18,-26);c.lineTo(-17,-16);c.closePath();c.fill();
  c.beginPath();c.moveTo(9,-20);c.lineTo(18,-26);c.lineTo(17,-16);c.closePath();c.fill();
  round(-10,-26,20,12,5,'#ed4059');line(-4,-24,3,-16,'#ffd8dc',2);
 }else{
  circle(0,-20,9,'#ffffff');
  c.strokeStyle='#e94759';c.lineWidth=2.5;c.beginPath();
  for(let j=0;j<=32;j++){const a=j*.25,r=j*.22;c.lineTo(Math.cos(a)*r, -20+Math.sin(a)*r)}c.stroke();
  circle(0,-20,1.7,'#e94759');
 }
 c.restore();
}
function scenery(camera){
 const grad=c.createLinearGradient(0,0,0,320);grad.addColorStop(0,'#88d3fa');grad.addColorStop(1,'#e5f9fa');c.fillStyle=grad;c.fillRect(0,0,W,H);
 for(let i=0;i<6;i++){let x=((i*185-camera*.16+t*.10)%1000+1000)%1000-90;ellipse(x,72+i%3*29,58,21,i%2?'#ffe49b':'#ffc4df');ellipse(x+26,62+i%3*29,32,23,i%2?'#fff0bc':'#ffdaeb');ellipse(x-18,64+i%3*29,24,17,i%2?'#fff1c6':'#ffe0ed')}
 for(let i=0;i<9;i++){let x=((i*158-camera*.38)%1500+1500)%1500-80;sweetHill(x,240,104,95,['#ff7e83','#ffa951','#ffe26d','#9ddc8b','#79c8ee','#a29bed','#d5a0e9'][i%7])}
 round(0,226,W,244,0,'#b7f2d7');
 // Far meadows with subtle receding contours, rather than flat colored shrub shapes.
 ellipse(130,295,265,55,'#a8ebcb');ellipse(620,299,315,50,'#a7edcf');
 // Small distant red and white flowers scattered across the mint grass.
 for(let i=0;i<105;i++){
   const x=((i*83+27-camera*.51)%3000+3000)%3000-20;
   const y=275+(i*19%43);
   const r=.8+(i%4)*.23;
   circle(x,y,r,i%3===0?'#fffefa':'#f44e64');
 }
 // BACK LAYER: miniature lollipop trees and houses on the far horizon.
 for(let i=0;i<18;i++){
  const x=((i*151+35-camera*.46)%2860+2860)%2860-90;
  const y=274+(i%3)*7;
  if(i%7===0)house(x,y,.30);
  else candy(x,y-51,.45+(i%3)*.07,i%2,(i*3+1)%lollyPalettes.length);
 }
 // Two existing dark-green bushes only, now farther back and with tiny gummy bears.
 const bears=['#f6a93e','#eb647e','#9a76df','#63cdb5','#ffd45b'];
 for(const [j,bx] of [235,575].entries()){
  const x=((bx-camera*.62)%1050+1050)%1050-85,y=285+j*5;
  ellipse(x,y,54,21,'#237f64');ellipse(x-23,y-8,29,21,'#2e9a73');ellipse(x+24,y-9,31,21,'#247c63');
  for(let q=0;q<5;q++){const gx=x-34+q*17,gy=y-16-(q%2)*4;gummyBear(gx,gy,.26,bears[(q+j*2)%bears.length])}
 }
 // MID LAYER: medium-size trees and candy-flower stems at varying distances.
 for(let i=0;i<16;i++){
  const x=((i*164+76-camera*.72)%2650+2650)%2650-75;
  const y=300+(i%3)*8;
  if(i%6===0)house(x,y,.48);
  else candy(x,y-66,.73+(i%3)*.08,i%2,(i*5+2)%lollyPalettes.length);
 }
 for(let i=0;i<19;i++){
  const x=((i*109+57-camera*.75)%2140+2140)%2140-30;
  candyFlower(x,311+(i%3)*3,.42+(i%2)*.10,i%2);
 }
 // NEAR LAYER: fewer, larger lollipop trees, with generous spaces between them.
 for(let i=0;i<9;i++){
  const x=((i*298+90-camera)%2700+2700)%2700-80;
  const y=324+(i%3)*3;
  if(i%4===0)house(x,y,.77);
  else if(i!==3) candy(x,y-94,1.08+(i%3)*.10,i%2,(i*4+3)%lollyPalettes.length);
 }
 // Foreground candy flowers, irregular spacing, smaller than the runners.
 for(let i=0;i<24;i++){
  const x=((i*89+17-camera)%2310+2310)%2310-25;
  const y=316+(i%4)*2;
  candyFlower(x,y,.63+(i%3)*.09,i%2);
 }
 // Occasional wrapped sweets on the grass, scaled by their distance.
 for(let i=0;i<8;i++){
  const x=((i*311+142-camera*.82)%2600+2600)%2600-50;
  wrappedCandy(x,299+(i%3)*6,.24+(i%3)*.06,i%2?.18:-.16);
 }
}
function trail(){
 // Rectangular rainbow road: no lower wave, all stripes remain inside its frame.
 const top=320, bottom=430;
 const colors=['#ff727a','#ffad60','#ffe578','#78d9a2','#78c6f3','#9187e6','#d79bea'];
 const band=(bottom-top)/colors.length;
 for(let i=0;i<colors.length;i++){c.fillStyle=colors[i];c.fillRect(0,top+i*band,W,band+.5)}
 for(let i=0;i<45;i++){let x=(i*79+13)%W,y=326+(i*47)%98;circle(x,y,1.3,'#ffffff80')}
 line(0,top,W,top,'#fff6e9',5);line(0,bottom,W,bottom,'#fff6e9',5);
}
function rabbit(x,y){
 c.save();c.translate(x,y+Math.abs(Math.sin(t*.09))*-8);
 // Fantasy lilac marshmallow bunny: ears grow from the head, not the body.
 const fur='#ab79ed',inner='#ffb8e9';
 ellipse(-3,3,17,12,fur);circle(-17,0,7,'#d5b5ff');
 ellipse(12,-25,5.5,18,fur);ellipse(23,-25,5.5,18,fur);
 ellipse(12,-26,2.5,12,inner);ellipse(23,-26,2.5,12,inner);
 circle(16,-7,12,fur);circle(20,-10,2.1,'#352454');circle(27,-3,2.3,'#ffdb77');
 ellipse(-9,11,8,4,'#8c5ccc');ellipse(8,12,8,4,'#8c5ccc');
 c.restore()
}
function bird(x,y){c.save();c.translate(x,y+Math.sin(t*.025)*5);ellipse(0,0,17,11,'#f68aa4');circle(13,-6,9,'#f68aa4');c.fillStyle='#ffcd67';c.beginPath();c.moveTo(20,-6);c.lineTo(31,-3);c.lineTo(20,0);c.fill();circle(15,-9,1.6,'#443c50');let flap=Math.sin(t*.2)*12;ellipse(-4,-4-flap*.5,12,Math.max(3,8+flap*.35),'#ffd1e0');c.restore()}
function butterfly(x,y){c.save();c.translate(x,y+Math.sin(t*.05)*7);let w=9+Math.abs(Math.sin(t*.18))*12;ellipse(-w*.55,-5,w*.75,14,'#ee92d4');ellipse(w*.55,-5,w*.75,14,'#ee92d4');ellipse(-w*.55,8,w*.55,8,'#f8c7e9');ellipse(w*.55,8,w*.55,8,'#f8c7e9');line(0,-8,0,12,'#70496d',3);c.restore()}
function character(k,index,same,dx=0,dy=0){
 // Tie is computed using absolute points BEFORE converting to world-local coordinates.
 // At a tie, the positions remain identical in points. Only the drawn figures are staggered for readability.
 const x=110+(k.display*13-cam)+dx;
 const offset=dy;
 const feetY=(renderWorld>0?(same?392:370):383)+offset, col=k.color;
 // Purpose-built WALKING gait: no bouncing, planted feet, straight arms,
 // small alternating strides and arms at half the leg frequency.
 const phase=t*.036+index*.8;
 const legSwing=Math.sin(phase)*12;
 const armSwing=Math.sin(phase*.5+index*.4)*8;
 const hipY=feetY-34, shoulderY=feetY-66, headY=feetY-88;
 c.save();c.lineCap='round';c.lineJoin='round';
 // Legs: back foot never lifts high; a subtle 2px foot clearance only.
 for(let j=0;j<2;j++){
   const dir=j===0?1:-1, stride=legSwing*dir;
   const footX=x+stride,footY=feetY-(Math.max(0,Math.sin(phase+j*Math.PI))*2);
   line(x,hipY,x+stride*.52,feetY-17,col,5.8);
   line(x+stride*.52,feetY-17,footX,footY,col,5.8);
   line(footX-2,footY,footX+5,footY,col,4);
 }
 line(x,hipY,x,shoulderY,col,6.5);
 // Arms nearly straight, relaxed and opposite, with slower swing.
 for(let j=0;j<2;j++){
   const dir=j===0?1:-1;
   line(x,shoulderY+3,x+dir*armSwing,shoulderY+28,col,5.5);
 }
 circle(x,headY,12,'#fffdf5');circle(x,headY,10.4,col);
 circle(x,headY,8.6,'#fff9e8');
 if(!facePhoto(k,x,headY,8.6))text(k.letter,x,headY+3.5,11,'#3e4864',800);
 c.restore();
 const labelY=headY-20;
 round(x-34,labelY-13,68,20,10,'#fffdfc');
 text(k.name,x,labelY+1,10,'#394359',800);
}
function milestone(p){let x=110+(p%450)*13-cam;if(x<25||x>W-20)return;round(x-21,442,42,22,11,'#fff9e9');text(p,x,457,12,'#865b49',800);line(x,434,x,441,'#fff7d7',2)}
// Independent appearances: long rests after each crossing, with occasional overlaps.
// Each encounter reverses direction on alternating appearances; animals remain off-screen between encounters.
const wildlife=[
 {kind:'rabbit',cycle:980,active:290,offset:0,y:302},
 {kind:'bird',cycle:1130,active:330,offset:420,y:115},
 {kind:'butterfly',cycle:1270,active:350,offset:760,y:184}
];
function drawWildlife(){
 for(const a of wildlife){
  const elapsed=t+a.offset;
  const appearance=Math.floor(elapsed/a.cycle);
  const phase=elapsed%a.cycle;
  if(phase>=a.active)continue;
  const leftToRight=appearance%2===0;
  const x=leftToRight?-65+(W+130)*phase/a.active:W+65-(W+130)*phase/a.active;
  c.save();
  if(!leftToRight){c.translate(2*x,0);c.scale(-1,1)}
  if(a.kind==='rabbit')rabbit(x,a.y);
  else if(a.kind==='bird')bird(x,a.y);
  else butterfly(x,a.y);
  c.restore();
 }
}
// Demostración de selección individual, portal y primer vistazo al mundo submarino.
let selected=0, activeWorld=0, transitionStart=-1, transitionFrom=0, transitionTo=0, transitionCameraReset=false;
function worldOf(k){return Math.floor(Math.max(0,k.p)/150)%3}
function portal(){let x=110+150*13-cam;if(x<-90||x>W+90)return;const glow=0.5+0.5*Math.sin(t*.05);c.save();c.shadowBlur=18+glow*12;c.shadowColor='#ffdf7e';ellipse(x,349,35,65,'#f7dcff');ellipse(x,349,27,57,'#af70e5');ellipse(x,349,19,49,'#b8f8fa');c.shadowBlur=0;round(x-61,205,122,25,10,'#fff9e9');text('REINO SUBMARINO',x,222,10,'#57488a',800);for(let i=0;i<6;i++){let a=t*.025+i*Math.PI/3;circle(x+43*Math.cos(a),349+72*Math.sin(a),3.2,'#fff7a3')}c.restore()}
// Underwater ecosystem: fewer fish, animated plants, coral, pearls, turtle and octopus.
function seaweed(x,y,h,col,phase){
 c.save();c.strokeStyle=col;c.lineWidth=5;c.lineCap='round';c.beginPath();c.moveTo(x,y);
 for(let j=1;j<=12;j++){let q=j/12;c.lineTo(x+Math.sin(t*.025+phase+q*3)*q*12,y-h*q)}c.stroke();c.restore();
}
function coral(x,y,scale,col){c.save();c.translate(x,y);c.scale(scale,scale);line(0,0,0,-40,col,8);line(0,-20,-17,-37,col,6);line(0,-28,16,-49,col,6);line(-17,-37,-20,-49,col,5);line(16,-49,24,-59,col,5);circle(0,-40,5,col);c.restore()}
function shell(x,y,scale,phase){
 c.save();c.translate(x,y);c.scale(scale,scale);
 let open=Math.pow(Math.max(0,Math.sin(t*.017+phase)),2),angle=-open*.72;
 // Both valves share the SAME left hinge; lid rotates, never floats.
 ellipse(0,1,27,9,'#b9799e');ellipse(0,-3,26,10,'#f6c6d8');
 if(open>.25){circle(4,-8,7,'#fffbea');circle(2,-10,2,'#ffffff');}
 c.save();c.translate(-25,-7);c.rotate(angle);c.translate(25,7);
 ellipse(0,-9,26,12,'#f4a9c9');for(let i=-2;i<=2;i++)line(i*8,-10,i*7,-18,'#d477a7',1.4);c.restore();
 circle(-25,-7,3,'#c77c9c');
 if(open>.65){for(let i=0;i<3;i++){let rise=(t*.85+i*25+phase*15)%100;circle(10+i*7,-24-rise,2.5+i%2,'#e2ffff99')}}c.restore();
}
function seaFish(x,y,sc,col,dir,kind){c.save();c.translate(x,y);c.scale(dir*sc,sc);let wag=Math.sin(t*.12+x)*5;
 if(kind===0){ellipse(0,0,17,10,col);c.fillStyle=col;c.beginPath();c.moveTo(-13,0);c.lineTo(-28,wag-10);c.lineTo(-28,wag+10);c.fill();ellipse(0,-9,7,5,col)}
 else if(kind===1){ellipse(0,0,19,7,col);c.fillStyle=col;c.beginPath();c.moveTo(-14,0);c.lineTo(-29,wag-6);c.lineTo(-29,wag+6);c.fill();line(-3,-6,-8,5,'#ffffffaa',2)}
 else{ellipse(0,0,12,13,col);c.fillStyle=col;c.beginPath();c.moveTo(-8,0);c.lineTo(-20,wag-8);c.lineTo(-20,wag+8);c.fill();line(0,-11,0,11,'#ffffff77',2)}
 circle(9,-2,2,'#263e65');c.restore()}
function turtle(x,y,sc,dir){c.save();c.translate(x,y);c.scale(sc*dir,sc);
 // Smooth underwater gliding: front flippers sweep in broad alternating arcs; rear ones stabilize.
 let phase=t*.032,stroke=Math.sin(phase),rear=Math.sin(phase+.85);
 for(let side of [-1,1]){
  c.save();c.translate(8,side*12);c.rotate(side*(.24+stroke*.48));ellipse(-2,side*19,10,25,'#92d653');ellipse(-2,side*23,6,18,'#b5e977');c.restore();
  c.save();c.translate(-19,side*11);c.rotate(side*(.785+rear*.12));ellipse(-13,side*13,8,16,'#92d653');c.restore();
 }
 ellipse(-27,0,8,5,'#82c849');ellipse(0,0,28,22,'#477b30');ellipse(0,-1,24,19,'#8bca36');
 c.strokeStyle='#356c26';c.lineWidth=2;c.beginPath();for(let j=0;j<6;j++){let a=j*Math.PI/3;c.lineTo(Math.cos(a)*11,Math.sin(a)*10)}c.closePath();c.stroke();
 for(let j=0;j<6;j++){let a=j*Math.PI/3;line(Math.cos(a)*11,Math.sin(a)*10,Math.cos(a)*23,Math.sin(a)*18,'#356c26',2)}
 circle(32,-2,11,'#a4e269');circle(36,-5,2.4,'#294a2d');circle(37,-6,1,'white');c.restore()}

function octopus(x,y,sc){c.save();c.translate(x,y);c.scale(sc,sc);
 let pulse=Math.sin(t*.067),spread=.7+.3*pulse;
 for(let i=0;i<8;i++){let a=Math.PI*.18+i*Math.PI*.82/7;let rootX=-17+i*4.8;
 c.strokeStyle='#ad75d8';c.lineWidth=5;c.lineCap='round';c.beginPath();c.moveTo(rootX,6);
 let ex=(i-3.5)*7*spread,ey=30+Math.cos(t*.067+i*.7)*6;
 c.bezierCurveTo(rootX+(i-3.5)*2,15,ex+Math.sin(t*.067+i)*7,20,ex,ey);c.stroke();}
 ellipse(0,-8,22,22,'#b488e4');circle(-8,-11,4,'white');circle(8,-11,4,'white');circle(-7,-11,1.7,'#40395f');circle(9,-11,1.7,'#40395f');c.restore()}
function rock(x,y,sc,large=false,variant=0){c.save();c.translate(x,y);c.scale(sc,sc);
 const profiles=[[-85,-12,-72,-39,-48,-47,-31,-70,-9,-63,8,-83,33,-64,54,-48,82,-20],[-95,-6,-81,-55,-55,-68,-30,-44,-8,-88,17,-78,38,-49,71,-54,91,-13],[-90,-9,-69,-24,-49,-77,-19,-88,7,-62,30,-69,53,-32,86,-14],[-90,-15,-76,-62,-47,-59,-24,-98,5,-83,34,-91,49,-48,84,-24],[-95,-8,-79,-32,-64,-66,-29,-56,-1,-79,22,-48,51,-70,90,-19],[-95,-10,-73,-47,-41,-91,-14,-66,16,-76,42,-42,66,-58,93,-12]];
 let pts=profiles[variant%profiles.length];c.fillStyle=['#4b7880','#51747e','#527f7d','#4b707d','#648888','#456f7b'][variant%6];c.beginPath();c.moveTo(pts[0],0);for(let i=0;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.lineTo(pts[pts.length-2],0);c.closePath();c.fill();
 c.fillStyle='#8bb0ad';c.beginPath();c.moveTo(pts[2],pts[3]);c.lineTo(pts[4],pts[5]);c.lineTo(pts[6],pts[7]);c.lineTo(pts[8],pts[9]);c.lineTo(-20,-28);c.closePath();c.fill();
 c.fillStyle='#315c67';c.beginPath();c.moveTo(pts[10],pts[11]);c.lineTo(pts[12],pts[13]);c.lineTo(pts[14],pts[15]);c.lineTo(35,-28);c.closePath();c.fill();
 if(large){ // True irregular cave cut into the rock, with a dark interior and blue-lit far exit.
 c.fillStyle='#163b4b';c.beginPath();c.moveTo(-42,0);c.lineTo(-39,-15);c.lineTo(-26,-35);c.lineTo(-12,-43);c.lineTo(3,-39);c.lineTo(15,-31);c.lineTo(30,-23);c.lineTo(39,-9);c.lineTo(40,0);c.closePath();c.fill();
 c.fillStyle='#236478';c.beginPath();c.moveTo(-23,0);c.lineTo(-17,-17);c.lineTo(-3,-29);c.lineTo(12,-24);c.lineTo(24,-10);c.lineTo(28,0);c.closePath();c.fill();
 c.fillStyle='#67b7c4';c.beginPath();c.moveTo(-6,0);c.lineTo(-3,-11);c.lineTo(7,-20);c.lineTo(15,-12);c.lineTo(18,0);c.closePath();c.fill();
 }c.restore()}

function crab(x,y,sc,seed=0){c.save();c.translate(x+Math.sin(t*.009+seed)*7,y);c.scale(sc,sc);
 // Sideways crab: four jointed walking legs on each side (8 total) plus two claws.
 let gait=t*.16;
 for(let side of [-1,1])for(let i=0;i<4;i++){
  let lift=Math.sin(gait+i*Math.PI*.72+(side===1?Math.PI:0))*3;
  let ax=side*(8+i*1.6), bx=side*(18+i*3), end=side*(24+i*3.5);
  line(ax,3,bx,5+(i-1.5)*2+lift,'#c74848',2.8);line(bx,5+(i-1.5)*2+lift,end,14+(i%2)*2+lift,'#c74848',2.4);
 }
 for(let side of [-1,1]){line(side*11,-4,side*22,-15,'#db5b52',4);ellipse(side*26,-16,9,7,'#f16b63');line(side*26,-16,side*32,-22,'#f16b63',3)}
 ellipse(0,0,17,10,'#f16d65');ellipse(0,-4,12,4,'#ff9c7f');line(-6,-6,-6,-15,'#c7494e',2);line(6,-6,6,-15,'#c7494e',2);circle(-6,-16,2.2,'#243d47');circle(6,-16,2.2,'#243d47');c.restore()}

function snail(x,y,sc,seed=0){c.save();c.translate(x+Math.sin(t*.007+seed)*8,y);c.scale(sc,sc);ellipse(0,0,18,5,'#d7ad89');ellipse(-3,-8,12,13,'#e7b777');c.strokeStyle='#ab785b';c.lineWidth=2;c.beginPath();c.arc(-3,-8,7,0,Math.PI*1.8);c.stroke();c.restore()}
function seahorse(x,y,sc,seed=0){c.save();c.translate(x+Math.sin(t*.009+seed)*20,y+Math.sin(t*.022+seed)*5);c.scale(sc,sc);
 // Slender continuous silhouette, with a narrow forward-facing curled tail.
 c.fillStyle='#eea13f';c.beginPath();c.moveTo(-7,-31);
 c.bezierCurveTo(-18,-27,-18,-11,-12,2);
 c.bezierCurveTo(-9,10,-5,14,-5,19);
 c.bezierCurveTo(-5,28,4,35,13,31);
 c.bezierCurveTo(21,27,19,18,13,18);
 c.bezierCurveTo(8,18,7,23,11,25);
 c.bezierCurveTo(5,26,3,21,4,17);
 c.bezierCurveTo(6,11,3,5,2,0);
 c.bezierCurveTo(7,-10,9,-20,7,-27);
 c.bezierCurveTo(4,-33,-2,-35,-7,-31);c.fill();
 ellipse(-5,-10,7,13,'#ffd26e');ellipse(0,-29,12,8,'#f5b04c');ellipse(14,-27,10,3.2,'#f5b04c');circle(5,-32,2.3,'#33485a');
 c.fillStyle='#d98438';for(let i=0;i<7;i++){let xx=i<3?-7-i*2:-13+(i-3)*1.1,yy=-34+i*5.3;c.beginPath();c.moveTo(xx,yy);c.lineTo(xx-7,yy-4);c.lineTo(xx-3,yy+4);c.fill()}
 c.save();c.translate(-9,-7);c.rotate(Math.sin(t*.09)*.25);ellipse(-6,0,7,2.5,'#ffca5f');c.restore();c.restore()}

function shark(x,y,sc,dir){c.save();c.translate(x,y);c.scale(dir*sc*2,sc*2);
 // Single connected silhouette: open jaw hinges directly under the snout.
 const body='#688c9d', jaw='#7699a9', inside='#263b46';
 c.fillStyle=body;c.beginPath();c.moveTo(-49,-2);
 c.bezierCurveTo(-29,-18,10,-20,34,-12);c.quadraticCurveTo(48,-9,49,-3);
 c.quadraticCurveTo(46,1,40,3);c.quadraticCurveTo(13,16,-49,3);c.closePath();c.fill();
 c.beginPath();c.moveTo(-10,-12);c.lineTo(-3,-40);c.lineTo(13,-13);c.fill();
 c.beginPath();c.moveTo(-42,0);c.lineTo(-70,-23);c.lineTo(-59,0);c.lineTo(-70,23);c.closePath();c.fill();
 c.beginPath();c.moveTo(-1,11);c.lineTo(-18,27);c.lineTo(18,11);c.fill();
 // Attached, tilted lower jaw: the left end is embedded in the body,
 // while the right tip joins the snout. Both rows of small teeth fit the gap.
 c.fillStyle=jaw;c.beginPath();c.moveTo(23,8);
 c.quadraticCurveTo(31,9,38,6);c.quadraticCurveTo(45,3,49,-3);
 c.quadraticCurveTo(48,5,43,9);c.quadraticCurveTo(34,13,23,8);c.closePath();c.fill();
 c.fillStyle=inside;c.beginPath();c.moveTo(32,6);
 c.quadraticCurveTo(42,4,49,-3);c.quadraticCurveTo(47,3,42,6);
 c.quadraticCurveTo(37,9,32,8);c.closePath();c.fill();
 c.fillStyle='#fff';
 for(let i=0;i<6;i++){let xx=33+i*2.45, top=5.7-i*.95;
 c.beginPath();c.moveTo(xx,top);c.lineTo(xx+1.0,top+1.55);c.lineTo(xx+1.95,top-.3);c.closePath();c.fill()}
 for(let i=0;i<5;i++){let xx=33.8+i*2.55, low=8.0-i*.76;
 c.beginPath();c.moveTo(xx,low);c.lineTo(xx+1,low-1.3);c.lineTo(xx+1.9,low-.25);c.closePath();c.fill()}
 circle(32,-8,2.2,'#233844');c.restore()}

function whale(x,y,sc,dir){c.save();c.translate(x,y);c.scale(dir*sc*3,sc*3);
 ellipse(0,0,65,27,'#6489b5');ellipse(13,12,42,12,'#b7d4e1');
 c.fillStyle='#6489b5';c.beginPath();c.moveTo(-55,0);c.lineTo(-87,-22);c.lineTo(-79,0);c.lineTo(-87,22);c.fill();
 c.beginPath();c.moveTo(-8,15);c.lineTo(-23,33);c.lineTo(20,15);c.fill();circle(39,-8,2.5,'#203b59');
 // Blowhole (no air spout underwater).
 ellipse(30,-23,5,2,'#446c95');c.restore()}

function boatAbove(x){c.save();c.translate(x,0);c.fillStyle='#446f85';c.beginPath();c.moveTo(-78,0);c.lineTo(78,0);c.lineTo(53,20);c.lineTo(-53,20);c.closePath();c.fill();round(-25,-17,53,18,3,'#638ea1');line(-5,0,-5,-29,'#406479',3);c.fillStyle='#b3d9dc';c.beginPath();c.moveTo(-3,-28);c.lineTo(40,-5);c.lineTo(-3,-5);c.fill();c.restore()}
function wreck(x,y,sc,far){c.save();c.translate(x,y);c.scale(sc,sc);
 c.globalAlpha=far?.38:.75;let hull=far?'#327f89':'#456e75',detail=far?'#327f89':'#755c4c';
 c.fillStyle=hull;c.beginPath();c.moveTo(-94,0);c.lineTo(-76,21);c.lineTo(57,24);c.lineTo(94,-4);c.lineTo(45,4);c.lineTo(-30,-4);c.closePath();c.fill();
 c.save();c.translate(8,0);c.rotate(-.17);line(-15,1,-15,-91,detail,6);line(-15,-82,28,-20,detail,4);line(-65,0,-65,-45,detail,5);c.restore();
 round(-32,-18,45,17,2,hull);for(let i=0;i<4;i++)circle(-48+i*28,10,4,far?'#3c9096':'#294f58');c.restore()}
function wreckTwo(x,y,sc){c.save();c.translate(x,y);c.rotate(-.095);c.scale(sc,sc);c.globalAlpha=.78;
 // Wide broken cargo steamer, distinctly NOT a sailing vessel: no masts.
 c.fillStyle='#466d76';c.beginPath();c.moveTo(-125,-18);c.lineTo(-92,17);c.lineTo(78,20);c.lineTo(125,-19);c.lineTo(54,-9);c.lineTo(-40,-14);c.closePath();c.fill();
 c.fillStyle='#335b66';round(-60,-40,108,26,4,'#527f84');round(-18,-64,49,26,3,'#5b8185');
 c.fillStyle='#406771';round(10,-90,14,27,3,'#456f78');
 for(let j=0;j<5;j++){circle(-78+j*38,-7,6,'#244a56');circle(-78+j*38,-7,3,'#9db2a7')}
 c.strokeStyle='#283e47';c.lineWidth=5;c.beginPath();c.moveTo(62,-14);c.lineTo(77,-31);c.lineTo(91,-18);c.stroke();
 c.restore()}
function shoal(baseX,baseY,dir,count,seed){
 // Elliptical living school: individual offsets vary continuously, not a 3x3 grid.
 for(let j=0;j<count;j++){
 let a=j*2.39996+seed, r=Math.sqrt((j+.4)/count), morph=Math.sin(t*.018+j*.39+seed);
 let fx=baseX+Math.cos(a)*r*(45+8*morph)+Math.sin(t*.03+j*.4)*3;
 let fy=baseY+Math.sin(a)*r*(22+4*morph)+Math.cos(t*.027+j*.35)*3;
 seaFish(fx,fy,.13+(j%5)*.026,['#ffe39b','#d9edb5','#f6d5a0'][j%3],dir,j%3)
 }}
function starfish(x,y,sc,col){c.save();c.translate(x,y);c.scale(sc*1.8,sc*1.8);c.fillStyle=col;
 const pts=[];for(let i=0;i<10;i++){let a=-Math.PI/2+i*Math.PI/5,r=i%2?9:19;pts.push([Math.cos(a)*r,Math.sin(a)*r])}
 c.beginPath();for(let i=0;i<10;i++){let p=pts[i],n=pts[(i+1)%10],prev=pts[(i+9)%10];let a=[p[0]*.78+prev[0]*.22,p[1]*.78+prev[1]*.22],b=[p[0]*.78+n[0]*.22,p[1]*.78+n[1]*.22];if(i===0)c.moveTo(...a);else c.lineTo(...a);c.quadraticCurveTo(p[0],p[1],b[0],b[1])}c.closePath();c.fill();
 circle(-5,-1,2,'#354054');circle(5,-1,2,'#354054');
 c.strokeStyle='#8b4359';c.lineWidth=1.7;c.lineCap='round';c.beginPath();c.arc(0,2,6,.15,Math.PI-.15);c.stroke();c.restore()}

function merfolk(x,y,sc,dir,masc){
 c.save();c.translate(x,y+Math.sin(t*.014)*7);c.scale(sc*dir,sc);
 // Swimming horizontally, facing the direction of travel. The whole body remains level.
 c.rotate(Math.PI/2 + Math.sin(t*.009)*.045);
 const skin=masc?'#e6ad85':'#f3b18f',hair=masc?'#29394d':'#cf4e55';
 const tail=masc?'#2378bb':'#28b5b1';
 // Continuous tail; animate the tail and both fins together, like a dolphin's flukes.
 c.fillStyle=tail;c.beginPath();c.moveTo(-12,6);c.quadraticCurveTo(-17,24,-7,41);c.quadraticCurveTo(0,48,0,56);c.quadraticCurveTo(9,46,11,40);c.quadraticCurveTo(17,22,10,6);c.closePath();c.fill();
 c.save();c.translate(0,53);c.rotate(Math.sin(t*.052)*.31);
 c.fillStyle=tail;c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(-15,-10,-24,-3);c.quadraticCurveTo(-27,9,-11,15);c.quadraticCurveTo(-2,13,0,6);c.quadraticCurveTo(12,17,24,13);c.quadraticCurveTo(27,0,12,-4);c.closePath();c.fill();c.restore();
 ellipse(0,-8,12,20,skin);
 // Arms are symmetrical in length and shoulder position.
 const sway=Math.sin(t*.035)*3;
 line(-10,-19,-23,-5+sway,skin,5);line(10,-19,23,-5-sway,skin,5);
 if(!masc){ellipse(-6,-9,6,5,'#40c7b9');ellipse(6,-9,6,5,'#40c7b9')}
 ellipse(-1,-34,masc?13:16,masc?13:18,hair);circle(0,-32,12,skin);
 c.fillStyle=hair;c.beginPath();c.moveTo(-12,-35);c.quadraticCurveTo(-12,-50,3,-46);c.quadraticCurveTo(15,-44,12,-34);c.quadraticCurveTo(3,-43,-4,-38);c.quadraticCurveTo(-8,-36,-12,-35);c.fill();
 if(!masc){ellipse(-13,-24,5,15,hair);ellipse(12,-24,5,14,hair)}
 circle(-4,-32,1.3,'#273c4a');circle(5,-32,1.3,'#273c4a');
 c.strokeStyle='#b45c5e';c.lineWidth=1.4;c.beginPath();c.arc(1,-27,3,.15,Math.PI-.1);c.stroke();
 if(masc){
 // Three-pronged trident with sharp arrowhead tips, two symmetric side prongs.
 c.save();c.translate(23,-9);c.strokeStyle='#d5ae39';c.lineWidth=2.8;c.lineCap='round';
 c.beginPath();c.moveTo(0,24);c.lineTo(0,-47);c.stroke();
 c.beginPath();c.moveTo(-9,-42);c.lineTo(-9,-31);c.quadraticCurveTo(-9,-24,0,-24);
 c.moveTo(9,-42);c.lineTo(9,-31);c.quadraticCurveTo(9,-24,0,-24);c.stroke();
 c.fillStyle='#e6c14b';for(const px of [-9,0,9]){c.beginPath();c.moveTo(px,-54);c.lineTo(px-4,-43);c.lineTo(px+4,-43);c.closePath();c.fill()}
 c.restore();
 }
 c.restore();
}

function underwater(){
 let g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#3eb4d5');g.addColorStop(.7,'#85d9d9');g.addColorStop(1,'#b8eee2');c.fillStyle=g;c.fillRect(0,0,W,H);
 for(let i=0;i<4;i++){c.fillStyle='#e7ffff0b';c.beginPath();let x=70+i*215;c.moveTo(x,-10);c.lineTo(x+35,-10);c.lineTo(x+150,340);c.lineTo(x+65,340);c.fill()}
 for(let i=0;i<8;i++){let x=((i*177-cam*.13)%1100+1100)%1100-90;ellipse(x,340,100+(i%3)*26,24,'#41abb4')}
 // Two wrecks fixed in world coordinates: distant silhouette near 100; second around 150.
 let wreckFarX=110+(164-150)*13-cam*.28;
 if(wreckFarX>-230&&wreckFarX<W+230)wreck(wreckFarX,323,.78,true);
 let wreckNearX=110+(219-150)*13-cam*.62;
 if(wreckNearX>-240&&wreckNearX<W+240){wreckTwo(wreckNearX,334,1.9);
 for(let j=0;j<11;j++){let u=(t*(.26+j*.018)+j*21)%230, fx=wreckNearX-110+u; if(u<210)seaFish(fx,338+Math.sin(t*.025+j)*13,.12+j%3*.02,'#ffdf88',1,j%3)}
 }
 // Irregular cave formations at different depths, no repeated evenly spaced igloos.
 const caves=[[-80,1.1,0],[330,.63,1],[790,1.24,2],[1230,.85,3],[1740,1.13,4],[2310,.79,5]];
 for(let i=0;i<caves.length;i++){
  const [wx,sc,v]=caves[i],x=wx-cam*.38;
  if(x<-140||x>W+150)continue;
  rock(x,367,sc,(v===0||v===2||v===4),v);
  // Fish move in and out of each cave and occasionally disappear behind its edges.
  for(let j=0;j<5;j++){let u=(t*(.35+j*.04)+j*33+i*59)%175;let fx=x-66+u,fy=344+Math.sin(t*.034+j)*7+(j%3)*4;
   if((v===0||v===2||v===4)&&u<145 && (u<45||u>93))seaFish(fx,fy,.16+j*.012,'#ffe08d',1,j%3);
  }
 }
 // Plants and coral are spread at different depths, not in a single row.
 for(let i=0;i<75;i++){let x=((i*71+(i*i*43)%177+70-cam*(.18+(i%4)*.045))%3900+3900)%3900-90;seaweed(x,365+(i%3)*4,26+(i*23)%105,['#176f65','#278e70','#4ebd8c','#76c88e','#398e57'][i%5],i*.9)}
 for(let i=0;i<8;i++){let x=((i*241+85-cam*.38)%1800+1800)%1800-80;coral(x,375,.55+(i%3)*.22,['#ff9cb9','#ffa972','#ac87df','#ffcf88'][i%4])}
 // Starfish rest among rocks and seaweed.
 for(let i=0;i<8;i++){let x=((i*311+i*i*23+140-cam*.37)%2300+2300)%2300-90;starfish(x,359-(i%3)*7,.4+(i%3)*.13,['#f7a36f','#d87aa9','#ffd18a','#b7a0f2','#8ad3a9'][i%5])}
 // Occasional mermaid and merman, independent of the points and camera.
 let mt=(t+410)%2700;if(mt<550)merfolk(-80+mt*1.6,185+Math.sin(t*.013)*22,.85,1,false);
 let mn=(t+1350)%3100;if(mn<520)merfolk(W+70-mn*1.7,235+Math.sin(t*.015)*18,.95,-1,true);
 // Different fish, sizes, speeds and directions.
 const fish=[{x:35,y:130,v:.33,sc:.8,col:'#ffd178',dir:1,k:0},{x:440,y:205,v:.18,sc:1.1,col:'#ff96bf',dir:-1,k:1},{x:180,y:285,v:.25,sc:.62,col:'#aa93ed',dir:1,k:2},{x:690,y:105,v:.13,sc:.9,col:'#92e6b3',dir:-1,k:0}];
 for(const f of fish){let xx=((f.x+t*f.v*f.dir+110)%950+950)%950-100;seaFish(xx,f.y+Math.sin(t*.025+f.x)*5,f.sc,f.col,f.dir,f.k)}
 // Free-form coordinated schools of different sizes, changing shape as they swim.
 for(let group=0;group<3;group++){let dir=group%2===0?1:-1;
 let base=((group*370+t*(.28+group*.12)*dir+1500)%1250+1250)%1250-170;
 shoal(base,145+group*65+Math.sin(t*.015+group)*11,dir,[23,13,32][group],group*1.7)}
 let tt=(t+150)%1600;if(tt<500)turtle(-100+tt*1.85,142+Math.sin(t*.025)*11,1.05,1);
 let ot=(t+660)%1750;if(ot<470)octopus(W+45-ot*1.9,258+Math.sin(t*.03)*10,.8);
 let st=(t+210)%1900;if(st<440)shark(-180+st*2.4,100+Math.sin(t*.02)*8,.78,1);
 let wt=(t+900)%2600;if(wt<620)whale(W+260-wt*1.9,102+Math.sin(t*.012)*12,.62,-1);
 let bt=(t+300)%2100;if(bt<650)boatAbove(-110+bt*1.5);
 for(let i=0;i<3;i++){let x=((i*377+95-cam*.4)%1300+1300)%1300-100;seahorse(x,290+(i%2)*28,.75,i*1.5)}
 // Flat sand route for walkers, with interactive shells and floor creatures.
 round(0,370,W,65,0,'#f2d49c');line(0,370,W,370,'#fff0c9',4);round(0,435,W,35,0,'#b6e7d5');
 for(let row=0;row<3;row++)for(let i=0;i<44;i++){let x=((i*23+row*13-cam*.36)%W+W)%W;let y=388+row*15+Math.sin(i*.48+row*1.7+t*.004)*4;circle(x,y,1.1+(i%3)*.2,'#fff3d8')}
 for(let i=0;i<4;i++){let x=((i*253+70-cam*.5)%1100+1100)%1100-100;shell(x,370,.62+(i%2)*.19,i*2.2)}
 for(let i=0;i<3;i++){let x=((i*411+240-cam*.5)%1350+1350)%1350-100;rock(x,372,.3,false)}
 for(let i=0;i<3;i++){let x=((i*421+90-cam*.5)%1300+1300)%1300-100;crab(x,370,.65+(i%2)*.2,i*1.7)}
 for(let i=0;i<4;i++){let x=((i*347+(i*i*43)+280-cam*.38)%1710+1710)%1710-100;snail(x, i%2?371:358,.52+(i%3)*.1,i*1.2)}
 for(let i=0;i<12;i++){let x=((i*123+t*.12)%930+930)%930-70;let y=35+(i*79)%290;circle(x,y,2+(i%4)*1.3,'#e1ffff83')}
}
// Mundo 3: mismo motor de cámara y caminata, con decoración espacial 2D Canvas.
const planets=[
 ['Mercurio',313,44,15,'#b6adb1','Pequeño y rocoso'],
 ['Venus',331,67,22,'#e4b875','Atmósfera densa'],
 ['Tierra',349,50,25,'#388bd9','Océanos y continentes'],
 ['Marte',366,71,21,'#cb654a','Planeta rojo'],
 ['Júpiter',384,43,40,'#c79c7d','Gigante gaseoso'],
 ['Saturno',402,65,32,'#e4c99a','Anillos de hielo'],
 ['Urano',422,46,26,'#87d6df','Gigante helado'],
 ['Neptuno',434,72,26,'#497cda','Azul y ventoso']
];
function spacePlanet(x,y,r,col,name,feature,i){
 c.save();c.translate(x,y);const phase=t*.004+i*.8;
 // Anillos posteriores de Saturno: pasan por DETRAS de la esfera.
 if(name==='Saturno'){c.save();c.rotate(-.29);for(let [rx,ry,w,color] of [[1.94,.57,3,'#9e8b7b'],[1.8,.51,6,'#f3e0b7'],[1.7,.48,8,'#b69a72']]){c.beginPath();c.ellipse(0,0,r*rx,r*ry,0,Math.PI,Math.PI*2);c.strokeStyle=color;c.lineWidth=w;c.stroke()}c.restore()}

 // Sombra y luz lateral para que cada planeta tenga volumen.
 c.shadowColor=col;c.shadowBlur=16;circle(0,0,r,col);c.shadowBlur=0;
 c.save();c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.clip();
 const bands=(colors,n,wiggle=2)=>{for(let j=0;j<n;j++){let yy=-r+j*2*r/n;c.beginPath();c.moveTo(-r-3,yy);for(let xx=-r;xx<=r+4;xx+=3)c.lineTo(xx,yy+Math.sin(xx*.13+phase+j)*wiggle);c.lineTo(r+4,yy+2*r/n+2);c.lineTo(-r-4,yy+2*r/n+2);c.closePath();c.fillStyle=colors[j%colors.length];c.fill()}};
 if(name==='Mercurio'){bands(['#aaa5a4','#c8c3c1','#918b8e','#b5aeac'],9,1);for(let j=0;j<18;j++){let xx=Math.sin(j*17.4)*r*.82,yy=Math.cos(j*11.8)*r*.82,rr=1.5+(j%4)*.85;circle(xx,yy,rr,'#77727b88');circle(xx-.7,yy-.7,rr*.55,'#dcd6d4aa')}}
 if(name==='Venus'){bands(['#f5d99d','#dca35c','#eac78d','#f4dfae','#c99259'],12,3);for(let j=0;j<7;j++)ellipse(Math.sin(j*2.3+phase)*r*.65,-r+j*r*.32,r*.5,2,'#fff0c866')}
 if(name==='Tierra'){
  c.save();c.rotate(-.32); // eje terrestre inclinado: continentes y polos giran juntos
  circle(0,0,r,'#1666b1');
  ellipse(0,-r*.9,r*.68,r*.16,'#f7fcff');ellipse(0,r*.92,r*.7,r*.15,'#eefaff');
  // Continentes reconocibles proyectados en una esfera que rota: América, Eurasia,
  // África, Australia y Antártida. La longitud se desplaza continuamente.
  const continents=[
   [[-128,57],[-117,70],[-92,71],[-80,58],[-95,49],[-82,29],[-98,15],[-110,27],[-116,38],[-128,57]],
   [[-80,12],[-70,8],[-62,-4],[-50,-10],[-43,-23],[-53,-36],[-69,-55],[-75,-29],[-81,-6],[-80,12]],
   [[-11,36],[0,44],[15,45],[33,32],[43,12],[34,-2],[25,-17],[17,-35],[10,-34],[3,-12],[-7,5],[-17,18],[-11,36]],
   [[-10,36],[-11,49],[1,58],[23,70],[55,62],[81,56],[108,59],[143,49],[153,34],[128,20],[104,11],[90,22],[68,7],[46,29],[33,36],[21,33],[10,37],[-10,36]],
   [[113,-11],[132,-11],[153,-26],[146,-39],[116,-34],[113,-11]],
   [[-180,-73],[-115,-78],[-50,-76],[25,-79],[90,-75],[160,-79],[180,-75]]
  ];
  const rotation=t*.22;const project=(lon,lat)=>{let l=(lon-rotation+540)%360-180;let la=lat*Math.PI/180;let rad=l*Math.PI/180;return {x:r*Math.cos(la)*Math.sin(rad),y:-r*Math.sin(la),front:Math.cos(rad)>0}};
  for(let poly of continents){c.fillStyle='#5fae5e';c.beginPath();let started=false;for(let [lon,lat] of poly){let pt=project(lon,lat);if(!pt.front){started=false;continue}if(!started){c.moveTo(pt.x,pt.y);started=true}else c.lineTo(pt.x,pt.y)}if(started)c.fill()}
  ellipse(0,-r*.92,r*.75,r*.12,'#ffffffdd');ellipse(0,r*.91,r*.7,r*.14,'#f9ffffdd');
  for(let j=0;j<5;j++){let xx=Math.sin(t*.006+j*2.2)*r*.68, yy=(-.65+j*.32)*r;ellipse(xx,yy,r*.3,1.7,'#ffffff8c')}
  c.restore();
 }
 if(name==='Marte'){bands(['#b84b35','#dc7952','#a94333','#d96b47','#c75d40'],10,1.8);for(let j=0;j<11;j++)ellipse(Math.sin(j*4.3)*r*.76,Math.cos(j*2.7)*r*.72,2+j%4,1+j%3,'#723f3588');ellipse(-r*.25,-r*.83,r*.4,r*.13,'#f8d9c5aa')}
 if(name==='Júpiter'){bands(['#e8d0b3','#ae735b','#d9a77d','#f0dcc4','#bd8064','#f1cfa6','#996755','#ead3b7'],18,2.4);ellipse(r*.32,r*.36,r*.29,r*.16,'#9c5146');ellipse(r*.31,r*.36,r*.20,r*.09,'#d78a70');ellipse(r*.27,r*.36,r*.12,r*.045,'#b76255')}
 if(name==='Saturno'){bands(['#ead3a5','#c7ad7f','#f3e0b9','#b79c75','#e4cda2'],15,1.1)}
 if(name==='Urano'){bands(['#a5e3e6','#76c8d2','#b1e7e8','#87d2db'],10,.6)}
 if(name==='Neptuno'){bands(['#2861bd','#3b83db','#2459b5','#477fd0','#1e4fa9'],12,1.2);ellipse(r*.27,r*.35,r*.3,r*.11,'#173d8a88')}
 const shade=c.createLinearGradient(-r,-r*.3,r,r*.3);shade.addColorStop(0,'#ffffff43');shade.addColorStop(.35,'#ffffff08');shade.addColorStop(.67,'#00000009');shade.addColorStop(1,'#02061c99');c.fillStyle=shade;c.fillRect(-r,-r,2*r,2*r);
 c.restore();
 if(name==='Saturno'){
  // Mitad DELANTERA de los anillos: oculta la parte inferior del planeta.
  c.save();c.rotate(-.29);for(let [rx,ry,w,color] of [[1.94,.57,3,'#a18b72'],[1.8,.51,6,'#f8e8c3'],[1.7,.48,8,'#c8ac7e']]){c.beginPath();c.ellipse(0,0,r*rx,r*ry,0,0,Math.PI);c.strokeStyle=color;c.lineWidth=w;c.stroke()}c.restore()
 }
 // Etiqueta única, sin descripciones ni líneas indicadoras.
 const labelY=r+(name==='Saturno'?22:13);round(-49,labelY-3,98,23,9,'#101c39e8');text(name,0,labelY+12,12,'#f8f7ff',800);
 c.restore();
}
function spaceMoon(x,y,r){
 c.save();c.translate(x,y);c.shadowColor='#c8d4e7';c.shadowBlur=8;circle(0,0,r,'#b7bbc7');c.shadowBlur=0;
 c.save();c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.clip();
 for(let j=0;j<14;j++){let a=j*2.4,rr=1.3+(j%4)*.65;let xx=Math.sin(a)*r*.79,yy=Math.cos(a*1.6)*r*.79;circle(xx,yy,rr,'#828b9d');circle(xx-.5,yy-.5,rr*.55,'#d6d9e1')}
 let g=c.createLinearGradient(-r,0,r,0);g.addColorStop(0,'#ffffff35');g.addColorStop(.6,'#00000000');g.addColorStop(1,'#151829bb');c.fillStyle=g;c.fillRect(-r,-r,2*r,2*r);c.restore();c.restore();
}
function spaceRock(x,y,r,seed){c.save();c.translate(x,y);c.rotate(t*.002*(seed%2?1:-1)+seed);c.beginPath();for(let i=0;i<9;i++){let a=i*Math.PI*2/9,rr=r*(.72+.26*Math.sin(seed*4+i*3));if(!i)c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);else c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}c.closePath();c.fillStyle='#88849a99';c.fill();circle(-r*.2,-r*.2,r*.2,'#504f6688');c.restore()}
let planetTargets=[];
const planetFacts=PLANET_FACTS;
function spaceScene(){
 planetTargets=[];
 c.fillStyle='#030513';c.fillRect(0,0,W,H);
 // Nebulosas suaves, lejanas: sin fotografías ni dependencias externas.
 for(let i=0;i<5;i++){let x=((i*275+100-cam*.08)%1300+1300)%1300-130,y=95+i%3*60;
 const g=c.createRadialGradient(x,y,5,x,y,130);g.addColorStop(0,i%2?'#49347b77':'#225ca777');g.addColorStop(1,'#03051300');c.fillStyle=g;c.fillRect(x-140,y-140,280,280)}
 for(let i=0;i<180;i++){let x=((i*127.71+i*i*3.1-cam*(.04+(i%4)*.025))%860+860)%860-65,y=(i*61.31+i*i*.13)%365;let b=.45+.55*Math.sin(t*.015+i*7);circle(x,y,(i%9===0?1.8:.7),`rgba(241,247,255,${.3+b*.6})`)}
 // Sol lejano y Luna craterizada, en capas del fondo.
 let sx=82-cam*.003;planetTargets.push({name:'Sol',x:sx,y:72,r:55});const sg=c.createRadialGradient(sx,72,2,sx,72,125);sg.addColorStop(0,'#ffe9a9bb');sg.addColorStop(.38,'#ffb84366');sg.addColorStop(1,'#ff9c1200');c.fillStyle=sg;c.fillRect(sx-135,-65,270,270);circle(sx,72,43,'#ffe29c');for(let j=0;j<6;j++){let a=t*.003+j*Math.PI/3;ellipse(sx+37*Math.cos(a),72+37*Math.sin(a),8,3,'#ffc65a88')}text('SOL',sx,128,11,'#ffe7a3',800);
 // La Luna orbita la Tierra, y muestra cráteres y terminador sombreado.
 // Se dibuja junto a la Tierra más abajo, no como objeto fijo gigante.
 // Planetas con nombre solamente, progresivamente por puntos.
 for(let i=0;i<planets.length;i++){let [name,p,y,r,col,feature]=planets[i];let orbit=t*.0015+i*1.2;
 let x=110+(p-300)*10.7-cam*.82+Math.sin(orbit)*11;
 let py=y+Math.cos(orbit)*7;
 if(x<-110||x>W+110)continue;planetTargets.push({name,x,y:py,r:Math.max(r,20)});
 if(name==='Tierra'){
  let ma=t*.009, moonX=x+Math.cos(ma)*63,moonY=py+Math.sin(ma)*19;
  // Semiórbita posterior y lunar: la luna se desplaza alrededor de la Tierra.
  c.save();c.strokeStyle='#ffffff19';c.lineWidth=1;c.beginPath();c.ellipse(x,py,63,19,0,0,Math.PI*2);c.stroke();c.restore();
  if(Math.sin(ma)<0)spaceMoon(moonX,moonY,12);
  spacePlanet(x,py,r,col,name,feature,i);
  if(Math.sin(ma)>=0)spaceMoon(moonX,moonY,12);
 }else spacePlanet(x,py,r,col,name,feature,i)}
 if(t%1200<480){round(195,273,330,28,13,'#172849dd');text('👆 Toca los planetas para descubrir sus secretos',360,291,12,'#ffffff',700)}
 // Camino: vía láctea horizontal luminosa, sin ondulación inferior.
 const milky=c.createLinearGradient(0,317,0,430);milky.addColorStop(0,'#221d52');milky.addColorStop(.3,'#584d9d');milky.addColorStop(.65,'#354f9a');milky.addColorStop(1,'#161c47');round(0,320,W,113,18,milky);
 // Neblina suave en ambos bordes, sin alterar el sendero aprobado.
 for(let edge of [320,433]){let haze=c.createLinearGradient(0,edge-24,0,edge+24);haze.addColorStop(0,'#8879d800');haze.addColorStop(.35,'#ad9dff28');haze.addColorStop(.5,'#b4b7ff63');haze.addColorStop(.7,'#88c5ff25');haze.addColorStop(1,'#8879d800');c.fillStyle=haze;c.fillRect(0,edge-24,W,48);for(let j=0;j<17;j++){let xx=((j*91+Math.sin(t*.003+j)*21-cam*.12)%820+820)%820-40;let yy=edge+Math.sin(t*.006+j*2.1)*7;let fog=c.createRadialGradient(xx,yy,1,xx,yy,27);fog.addColorStop(0,'#c4baff25');fog.addColorStop(1,'#c4baff00');c.fillStyle=fog;c.fillRect(xx-28,yy-28,56,56)}}
 c.save();c.globalCompositeOperation='screen';for(let i=0;i<8;i++){let y=335+i*12;line(0,y,W,y,['#9e77c744','#f6e4ff33','#4fd6f744'][i%3],5+i%3*2)}c.restore();
 for(let i=0;i<170;i++){let x=((i*57.2+i*i*1.4-cam*.8)%850+850)%850-50,y=326+(i*39.7)%101;circle(x,y,i%13===0?2.2:.75,i%4?'#c8f4ff':'#fff0b0')}
 round(0,434,W,36,0,'#0b1130');
 // OVNI con extraterrestre, satélites, cohete, cometa y estrellas fugaces: apariciones espaciadas.
 let u=(t+330)%2000;if(u<570){let x=-90+u*1.6,y=182+Math.sin(t*.025)*9;c.save();c.translate(x,y);ellipse(0,7,40,10,'#81d3d9');ellipse(0,1,26,17,'#b9eaffaa');circle(0,-7,9,'#a0ef91');circle(-3,-8,2,'#193a48');circle(4,-8,2,'#193a48');ellipse(0,9,41,8,'#8b8df2');for(let j=-2;j<=2;j++)circle(j*14,10,2.8,'#ffe07d');c.restore()}
 for(let j=0;j<3;j++){let q=(t+j*620)%2250;if(q<720){let x=(j%2?W+60-q*1.1:-60+q*1.1),y=114+j*65;c.save();c.translate(x,y);c.rotate(t*.004+j);round(-13,-8,26,16,4,'#e1e5ee');round(-43,-12,25,24,2,'#4c91ce');round(18,-12,25,24,2,'#4c91ce');for(let z of [-32,31])line(z,-10,z,10,'#c2f0ff',2);c.restore()}}
 let rocket=(t+1200)%2550;if(rocket<500){let x=-100+rocket*1.85,y=255-Math.sin(rocket/500*Math.PI)*80;c.save();c.translate(x,y);c.rotate(-.25);ellipse(0,0,29,9,'#f2f2ff');c.fillStyle='#ff6d69';c.beginPath();c.moveTo(29,0);c.lineTo(12,-9);c.lineTo(12,9);c.fill();circle(0,0,5,'#60d6ff');c.fillStyle='#e6b5ff';c.beginPath();c.moveTo(-28,-5);c.lineTo(-50,0);c.lineTo(-28,5);c.fill();c.restore()}
 let comet=(t+700)%1800;if(comet<250){let x=W+100-comet*3.8,y=55+comet*.32;
 c.save();c.translate(x,y);c.rotate(-.31);
 for(let j=0;j<8;j++){let g=c.createLinearGradient(0,0,165+j*8,0);g.addColorStop(0,'#d6ffffbb');g.addColorStop(.18,'#7fd8f899');g.addColorStop(1,'#57aaff00');c.fillStyle=g;c.beginPath();c.moveTo(0,-(4+j*1.2));c.quadraticCurveTo(90,-(10+j*2),170+j*9,-(2+j*2));c.quadraticCurveTo(105,6+j*2,0,5+j);c.fill()}
 for(let j=0;j<30;j++){let dx=15+(j*43)%170,dy=Math.sin(j*2.3+t*.03)*(.8+dx*.09);circle(dx,dy,.5+j%3*.35,'#c5faff88')}
 let halo=c.createRadialGradient(0,0,1,0,0,19);halo.addColorStop(0,'#ffffff');halo.addColorStop(.25,'#d4faffee');halo.addColorStop(.6,'#75cfff66');halo.addColorStop(1,'#75cfff00');c.fillStyle=halo;c.fillRect(-20,-20,40,40);ellipse(0,0,4,3,'#fffdf1');c.restore()}
 for(let j=0;j<3;j++){let q=(t+j*173+270)%1100;if(q<65){let x=100+j*220+q*3,y=45+j*47+q*.8;line(x-38,y-20,x,y,'#fff4bd99',2.5);circle(x,y,2,'white')}}
 // Historias de OVNIs: una sola escena ocasional, pilotos alternos y direcciones alternas.
 const fleetColors=[['#8ed9fa','#fa9c55'],['#ffc2ef','#69e7c5'],['#f8d87e','#ad83f9'],['#b7a5ff','#ffb46a']];
 const storyLength=1750, sceneDuration=540, storyTime=t%storyLength, storyIndex=Math.floor(t/storyLength);
 if(storyTime<sceneDuration){
   let scene=storyIndex%3,reverse=storyIndex%2===1,actors=[storyIndex%4,(storyIndex+1+Math.floor(storyIndex/4)%2)%4];
   function drawPilot(x,y,j,tilt,face,arms){
     c.save();c.translate(x,y);c.rotate(tilt);let [hull,skin]=fleetColors[j];
     ellipse(0,7,33,10,hull);ellipse(0,-1,22,15,'#a6e8ffbb');
     if(j%2===0){ellipse(0,-9,11,10,skin);line(0,-17,0,-25,skin,2);circle(0,-25,3,'#ffdf91')}
     else{ellipse(0,-9,12,8,skin);line(-7,-14,-13,-23,skin,2);line(7,-14,13,-23,skin,2);circle(-13,-23,2,skin);circle(13,-23,2,skin)}
     circle(-4,-10,2,'#1e3047');circle(5,-10,2,'#1e3047');
     if(face==='angry'){line(-8,-16,-2,-13,'#402b4a',2);line(3,-13,9,-16,'#402b4a',2);ellipse(0,-2,3,2,'#542847')}
     else if(face==='scream'){ellipse(0,-1,4,5,'#49264b')}
     else if(face==='tongue'){c.strokeStyle='#563654';c.lineWidth=2;c.beginPath();c.arc(0,-4,5,0,Math.PI);c.stroke();ellipse(1,1,3,5,'#ed5e91')}
     else{c.strokeStyle='#563654';c.lineWidth=1.6;c.beginPath();c.arc(0,-5,4,0,Math.PI);c.stroke()}
     if(arms){let w=Math.sin(t*.23+j)*9;line(-12,-6,-23,-17+w,skin,4);line(12,-6,23,-17-w,skin,4);circle(-23,-17+w,3,skin);circle(23,-17-w,3,skin)}
     for(let k=0;k<5;k++)circle(-22+k*11,8,2.4,['#ffe69b','#ff9edb','#9effe4'][k%3]);c.restore();
   }
   let u=storyTime/sceneDuration, dir=reverse?-1:1, a,b,ay=185,by=203,tiltA=0,tiltB=0,faceA='smile',faceB='smile',arms=false;
   if(scene===0){ // Encuentro, choque, gestos enfadados y separación.
      let approach=Math.min(1,u/.42);a=dir===1?-65+approach*405:W+65-approach*405;b=dir===1?W+65-approach*405:-65+approach*405;
      if(u>.42&&u<.72){a=W/2-24;b=W/2+24;tiltA=Math.sin(t*.19)*.16;tiltB=-tiltA;faceA=faceB='angry';arms=true;}
      if(u>=.72){let d=(u-.72)/.28;a=W/2-24-dir*d*470;b=W/2+24+dir*d*470;}
   }else if(scene===1){ // Segundo tipo de choque: se alejan invertidos y gritando.
      let q=Math.min(1,u/.38);a=dir===1?-70+q*420:W+70-q*420;b=dir===1?W+70-q*420:-70+q*420;
      if(u>=.38){let q=(u-.38)/.62;a=W/2-20-dir*q*540;b=W/2+20+dir*q*540;tiltA=Math.PI*(Math.min(1,q*4));tiltB=-Math.PI*Math.min(1,q*4);faceA=faceB='scream';arms=true;ay-=q*32;by+=q*25;}
   }else{ // Carrera: adelantamientos, lengua y empujones que fallan.
      let q=u,base=-95+q*(W+190);a=dir===1?base:W-base;b=a+dir*(65+Math.sin(q*13)*80);ay=184+Math.sin(t*.05)*7;by=199+Math.cos(t*.04)*8;
      faceA=Math.sin(q*13)>0?'tongue':'smile';faceB=Math.sin(q*13)<0?'tongue':'smile';arms=(q>.35&&q<.67);tiltA=Math.sin(q*17)*.12;tiltB=-Math.sin(q*17)*.12;
   }
   if(a>-90&&a<W+90)drawPilot(a,ay,actors[0],tiltA,faceA,arms);
   if(b>-90&&b<W+90)drawPilot(b,by,actors[1],tiltB,faceB,arms);
   if(scene!==2&&u>.37&&u<.43){for(let j=0;j<8;j++){let theta=j*Math.PI/4+t*.04;circle(W/2+Math.cos(theta)*22,194+Math.sin(theta)*20,2.5,'#fff0a6')}}
 }
 // Estación espacial, solo en la segunda mitad del recorrido.
 let stationX=110+105*13-cam*.82+Math.sin(t*.004)*9;
 if(stationX>-125&&stationX<W+125){c.save();c.translate(stationX,175+Math.sin(t*.008)*5);c.rotate(Math.sin(t*.004)*.09);
 line(-85,0,85,0,'#b8c8e3',3);round(-73,-16,43,32,2,'#3379bd');round(30,-16,43,32,2,'#3379bd');
 for(let side of [-1,1])for(let k=0;k<3;k++)line(side*34+k*side*11,-15,side*34+k*side*11,15,'#82b7f3',1);
 round(-28,-14,56,28,10,'#dce8f2');circle(-13,0,6,'#7dbce2');circle(8,0,6,'#7dbce2');round(-8,-29,16,16,4,'#b0b9cb');ellipse(0,-31,13,6,'#f3f6ff');line(-5,16,-5,37,'#e1e8fa',4);round(-19,34,28,14,5,'#f2f4fb');circle(-7,41,4,'#86b8da');line(6,-30,6,-51,'#cbdaf3',3);round(-9,-58,30,10,3,'#e8f1fa');line(-72,-22,-72,22,'#d9e6fa',2);line(72,-22,72,22,'#d9e6fa',2);c.restore()}
 // Astronauta perdido: historias largas, movimiento corporal real y menos apariciones.
 let flo=t%1450;
 if(flo<820){let episode=Math.floor(t/1450)%5,phase=flo/820,dir=episode%2?1:-1;
  let x=dir===-1?W+65-flo*1.12:-65+flo*1.12;
  let y=135+Math.sin(flo*.012)*22,hit=episode===2||episode===3;
  let hitAt=300,afterHit=hit&&flo>=hitAt,spin=0;
  if(episode===0){spin=-Math.PI/2+Math.sin(flo*.007)*.13;} // natación horizontal
  else if(episode===1){spin=Math.sin(flo*.004)*.09;y=65+flo*.19;} // escalera invisible
  else if(episode===2){spin=afterHit?(flo-hitAt)*.045:Math.sin(flo*.01)*.12;}
  else if(episode===3){spin=afterHit?Math.PI+(flo-hitAt)*.008:Math.sin(flo*.009)*.15;}
  else{spin=Math.sin(flo*.02)*.4;}
  if(hit&&flo>hitAt-75&&flo<hitAt+40){spaceRock(dir===-1?W+65-hitAt*1.12:-65+hitAt*1.12,135+Math.sin(hitAt*.012)*22,14,9)}
  c.save();c.translate(x,y);c.rotate(spin);c.scale(.76,.76);
  let a1=0,a2=0,kick=0;
  if(episode===0){a1=Math.sin(flo*.13)*27;a2=-a1;kick=Math.sin(flo*.15)*18;}
  else if(episode===1){a1=Math.sin(flo*.12)*24;a2=-a1;kick=Math.sin(flo*.12)*20;}
  else if(afterHit){a1=Math.sin(flo*.18)*28;a2=Math.cos(flo*.19)*29;kick=Math.sin(flo*.15)*17;}
  else{a1=Math.sin(flo*.04)*12;a2=Math.cos(flo*.05)*12;kick=Math.sin(flo*.07)*10;}
  line(-7,11,-11+kick,28,'#eaf2ff',8);line(7,11,12-kick,28,'#eaf2ff',8);
  line(-12,-3,-23+a1*.4,-13-a1,'#eaf2ff',7);line(12,-3,23+a2*.4,-13-a2,'#eaf2ff',7);
  circle(-23+a1*.4,-13-a1,4,'#a6c9e7');circle(23+a2*.4,-13-a2,4,'#a6c9e7');
  round(-13,-10,26,28,8,'#f0f5ff');round(-10,-3,20,10,3,'#f6a763');circle(0,-24,16,'#e8faff');ellipse(0,-25,12,9,'#82b9d8');
  if(afterHit){circle(-5,-26,2,'#18304b');circle(5,-26,2,'#18304b');ellipse(0,-19,3,4,'#18304b')}
  c.restore();
  if(afterHit&&flo<hitAt+70)for(let j=0;j<5;j++){let a=j*Math.PI*2/5+t*.04;circle(x+Math.cos(a)*22,y+Math.sin(a)*22,2,'#fff5a9')}
 }
 // Alienígena violeta cómico: la roca gira, se queda invertido, forcejea y vuelve arriba.
 let alienX=110+77*13-cam*.82;
 if(alienX>-95&&alienX<W+95){let phase=(t%520),angle=phase<180?Math.sin(t*.05)*.045:phase<220?Math.sin(t*.14)*(.05+(phase-180)*.005):phase<252?(phase-220)/32*Math.PI:phase<365?Math.PI+Math.sin(t*.19)*.10:phase<425?Math.PI+(phase-365)/60*Math.PI:Math.PI*2+Math.sin(t*.04)*.04;
 c.save();c.translate(alienX,269+Math.sin(t*.008)*2);c.rotate(angle);
 ellipse(0,15,40,13,'#71648b');ellipse(-10,9,27,14,'#a99cbd');circle(-22,12,5,'#5c5076');
 line(-8,0,-12,-17,'#c78ff4',5);line(9,0,13,-17,'#c78ff4',5);ellipse(0,-19,16,19,'#bd80e7');
 line(-9,-32,-14,-41,'#b87be5',2);circle(-14,-41,3,'#f8d46e');line(9,-32,14,-41,'#b87be5',2);circle(14,-41,3,'#f8d46e');
 ellipse(-6,-23,3.5,5,'#fff');ellipse(6,-23,3.5,5,'#fff');circle(-5,-22,1.8,'#3a235b');circle(7,-22,1.8,'#3a235b');
 c.strokeStyle='#5d2e76';c.lineWidth=2;c.beginPath();if(phase>252&&phase<425){c.arc(0,-12,5,Math.PI,Math.PI*2)}else{c.arc(0,-16,6,0,Math.PI)}c.stroke();
 let wiggle=phase>252&&phase<425?Math.sin(t*.35)*9:Math.sin(t*.06)*3;line(13,-6,24,-12+wiggle,'#c78ff4',4);circle(24,-12+wiggle,3,'#c78ff4');c.restore()}
 // Galaxia espiral distante, pequeña, con rotación lenta.
 let gx=110+122*13-cam*.13,gy=236;if(gx>-100&&gx<W+100){c.save();c.translate(gx,gy);c.rotate(t*.0008);c.scale(1,.48);
 for(let a=0;a<3;a++)for(let j=0;j<55;j++){let theta=j*.16+a*Math.PI*2/3,rad=2+j*.56;circle(Math.cos(theta)*rad,Math.sin(theta)*rad,1.1,'#b8b3ff77')}
 c.shadowBlur=13;c.shadowColor='#b4adff';circle(0,0,8,'#f8ecff');c.restore()}
 // Nebulosas adicionales con movimiento extremadamente lento.
 for(let n=0;n<3;n++){let nx=110+(30+n*27)*13-cam*.11,ny=175+n%2*70;if(nx>-180&&nx<W+180){let gr=c.createRadialGradient(nx,ny,3,nx,ny,95);gr.addColorStop(0,['#a94e9a30','#3d90d32b','#9c67d030'][n]);gr.addColorStop(1,'#07071900');c.fillStyle=gr;c.fillRect(nx-100,ny-100,200,200)}}
 // Asteroides distantes.
 for(let j=0;j<9;j++){let x=((j*193-cam*.35+t*.07*(j%2?1:-1))%1150+1150)%1150-100,y=240+j%3*22;spaceRock(x,y,5+j%3*3,j)}
}
function astronaut(k,index,same,dx=0,dy=0){
 const x=110+(k.display*13-cam)+dx,off=dy,feet=390+off;
 const phase=t*.032+index*.8,leg=Math.sin(phase)*9,arm=Math.sin(phase*.5)*7;
 c.save();c.lineCap='round';c.lineJoin='round';
 for(let j=0;j<2;j++){let d=j?1:-1;line(x,feet-35,x+d*leg*.5,feet-16,'#dfe7f5',11);line(x+d*leg*.5,feet-16,x+d*leg,feet,'#e8effa',10);line(x+d*leg-5,feet,x+d*leg+6,feet,'#596c92',5)}
 round(x-14,feet-70,28,38,9,'#eaf2ff');round(x-11,feet-63,22,13,4,k.color);round(x-7,feet-47,14,6,3,'#8199bd');
 for(let j=0;j<2;j++){let d=j?1:-1;line(x+d*12,feet-64,x+d*(20+arm),feet-39,'#eaf2ff',9);circle(x+d*(20+arm),feet-39,5,'#8199bd')}
 let hy=feet-89;circle(x,hy,21,'#a4d9ef55');circle(x,hy,17,'#e8faff');circle(x,hy,12,k.color);circle(x,hy,10,'#fff8eb');if(!facePhoto(k,x,hy,10))text(k.letter,x,hy+4,11,'#344464',800);
 c.strokeStyle='#eaffff';c.lineWidth=3;c.beginPath();c.arc(x,hy,22,0,Math.PI*2);c.stroke();c.strokeStyle='#ffffffaa';c.lineWidth=2;c.beginPath();c.arc(x-4,hy-4,14,3.4,4.7);c.stroke();
 round(x-36,hy-49,72,19,9,'#f7f9ff');text(k.name,x,hy-36,11,'#344464',800);c.restore();
}
function spacePortal(){let x=110+150*13-cam;if(x<-100||x>W+100)return;let glow=.5+.5*Math.sin(t*.045);c.save();c.shadowBlur=20+glow*18;c.shadowColor='#bda0ff';ellipse(x,342,34,64,'#c3a4ff');ellipse(x,342,26,56,'#423e96');ellipse(x,342,17,47,'#12143c');c.shadowBlur=0;round(x-63,199,126,24,10,'#eee8ff');text('PLANETA ESPACIAL',x,215,10,'#514092',800);for(let i=0;i<11;i++){let a=t*.017+i*Math.PI*2/11;circle(x+45*Math.cos(a),342+70*Math.sin(a),2.6,'#fff4d7')}c.restore()}
function bubbleHelmet(k,same,dx=0,dy=0){let x=110+(k.display*13-cam)+dx;let off=dy;let headY=(renderWorld>0?(same?392:370):383)+off-88;c.save();c.strokeStyle='#e9ffff';c.lineWidth=3;c.beginPath();c.arc(x,headY,18,0,Math.PI*2);c.stroke();c.strokeStyle='#ffffff80';c.lineWidth=2;c.beginPath();c.arc(x-3,headY-3,12,3.4,4.8);c.stroke();c.restore()}
function overlayTransition(progress){
 let alpha=Math.sin(Math.PI*progress);c.save();const stars=transitionTo===2||transitionFrom===2;const candy=transitionTo===0;
 c.fillStyle=candy?`rgba(123,46,156,${alpha*.84})`:stars?`rgba(8,9,35,${alpha*.92})`:`rgba(23,139,188,${alpha*.87})`;c.fillRect(0,0,W,H);
 for(let i=0;i<54;i++){
  let x=((i*137+t*(i%3+1)*.5)%760+760)%760-20;
  let y=((i*73-t*(1+i%4)*.65)%530+530)%530;
  if(candy){let colors=['#ff7f9e','#ffd76c','#7edfe8','#b8a3ff'];c.save();c.translate(x,y);c.rotate(t*.01+i);if(i%3===0){circle(0,0,6,colors[i%4]);for(let z=0;z<5;z++)circle(Math.cos(z*6.28/5)*3,Math.sin(z*6.28/5)*3,1.2,'#fff')}else{ellipse(0,0,10,5,colors[i%4]);c.fillStyle='#fff8';c.beginPath();c.moveTo(-10,0);c.lineTo(-18,-6);c.lineTo(-18,6);c.fill();c.beginPath();c.moveTo(10,0);c.lineTo(18,-6);c.lineTo(18,6);c.fill()}c.restore()}else if(stars){
   // Estrellas de cinco puntas, no puntos unidos a líneas.
   let r=3+(i%5)*1.5+alpha*3;
   c.save();c.translate(x,y);c.rotate(t*.008+i);c.beginPath();
   for(let k=0;k<10;k++){let a=-Math.PI/2+k*Math.PI/5;let d=k%2?r*.44:r;let px=Math.cos(a)*d,py=Math.sin(a)*d;if(k===0)c.moveTo(px,py);else c.lineTo(px,py)}
   c.closePath();c.fillStyle=`rgba(255,246,192,${alpha*(.5+(i%4)*.12)})`;c.shadowColor='#e6d3ff';c.shadowBlur=9;c.fill();c.restore();
  }else{c.strokeStyle=`rgba(232,255,255,${alpha*.8})`;c.lineWidth=2;c.beginPath();c.arc(x,y,5+(i%5)*5,0,Math.PI*2);c.stroke()}
 }
 if(alpha>.4){round(182,174,356,98,20,candy?'#fff0f8':'#f7ffffed');text(candy?'¡VUELTA AL MUNDO DE LAS CHUCHES!':'¡NUEVO MUNDO DESCUBIERTO!',360,208,candy?16:19,candy?'#d04d98':'#287a9c',900);text(candy?'Pueblo de las Golosinas':transitionTo===2?'Planeta Espacial':'Reino submarino',360,242,21,candy?'#a15dc6':'#3566a7',800)}c.restore()
}
let renderWorld=0;

const lapOf=(p)=>Math.floor(Math.max(0,p)/450);
// Posición mostrada (puntos) de un niño en la escena que se ve ahora mismo. Durante la segunda mitad de
// una transición se usa el valor REAL (p) y no el suavizado (display): si no, al cruzar 449→450 el
// niño se dibujaría fuera de cuadro y las etiquetas seguirían en la vuelta anterior hasta el final.
function shownTotal(k,showing){return (transitionStart>=0&&showing===transitionTo)?k.p:k.display}
let emittedWorld=-1;const noSlots=(ps)=>ps.map(()=>({dx:0,dy:0,tied:false}));
function emitWorld(w){if(w!==emittedWorld){emittedWorld=w;if(hooks.onWorldShown)hooks.onWorldShown(w)}}
function choose(i){selected=i;const next=worldOf(kids[i]);if(transitionStart>=0){transitionTo=next;}else if(next!==activeWorld){transitionFrom=activeWorld;transitionTo=next;transitionStart=t;transitionCameraReset=false;}}
function snap(){
 const sel=kids[selected];if(!sel)return;
 for(const k of kids)k.display=k.p;
 activeWorld=worldOf(sel);transitionStart=-1;transitionCameraReset=false;renderWorld=activeWorld;
 cam=Math.max(0,(sel.p%450-activeWorld*150)*13-430);
}
function frame(){
 if(!paused)t++;
 for(const k of kids)k.display+=(k.p-k.display)*.028;
 const sel=kids[selected];if(!sel)return;
 c.setTransform(dpr,0,0,dpr,0,0);
 let w=worldOf(sel);if(transitionStart<0&&w!==activeWorld){transitionFrom=activeWorld;transitionTo=w;transitionStart=t;transitionCameraReset=false}
 let progress=transitionStart>=0?(t-transitionStart)/145:-1;
 if(progress>=1){activeWorld=transitionTo;transitionStart=-1;transitionCameraReset=false;progress=-1;cam=0;sel.display=sel.p}
 let showing=transitionStart>=0?(progress<.5?transitionFrom:transitionTo):activeWorld;
 if(transitionStart>=0 && progress>=.5 && !transitionCameraReset){cam=0;transitionCameraReset=true;}
 if(transitionStart<0)transitionCameraReset=false;
 let local=Math.max(0,shownTotal(sel,showing)%450-showing*150);
 let desired=Math.max(0,local*13-430);cam+=(desired-cam)*.09;
 renderWorld=showing;emitWorld(showing);
 const wantCursor=showing===2?'pointer':'default';if(cv.style.cursor!==wantCursor)cv.style.cursor=wantCursor;
 if(showing===0){scenery(cam);trail();portal();drawWildlife()}else if(showing===1){underwater();spacePortal()}else spaceScene();
 // Las etiquetas del camino suman el comienzo de LA VUELTA que se está viendo (0, 450, 900…).
 const labelBase=Math.floor(shownTotal(sel,showing)/450)*450;
 for(let p=showing*150;p<=showing*150+Math.max(60,Math.ceil((cam+W)/13/5)*5);p+=5){let x=110+(p-showing*150)*13-cam;if(x>=25&&x<W-20){round(x-21,442,42,22,11,'#fff9e9');text(labelBase+p,x,457,12,showing===0?'#865b49':'#416f8b',800)}}
 // Solo se dibujan los niños que están en el MISMO mundo y en la MISMA vuelta que el seleccionado.
 const lap=lapOf(sel.p);
 const drawn=[];for(let i=0;i<kids.length;i++){const k=kids[i];if(worldOf(k)===showing&&lapOf(k.p)===lap)drawn.push(i)}
 const slots=(hooks.figureSlots||noSlots)(drawn.map(i=>kids[i].display));
 const order=drawn.map((i,n)=>({i,slot:slots[n]})).sort((a,b)=>a.slot.dy-b.slot.dy);
 for(const {i,slot} of order){
  const k=kids[i],old=k.display,tied=slot.tied;
  k.display=Math.max(0,shownTotal(k,showing)%450-showing*150);
  if(showing===2)astronaut(k,i,tied,slot.dx,slot.dy);else{character(k,i,tied,slot.dx,slot.dy);if(showing===1)bubbleHelmet(k,tied,slot.dx,slot.dy)}
  k.display=old;
 }
 if(progress>=0)overlayTransition(Math.min(1,progress));
}
// Foto real del miembro recortada en círculo dentro de la cabeza del muñeco (si aún no ha cargado, o no
// tiene foto, se queda la letra del prototipo).
function facePhoto(k,x,y,r){
 const im=k.photo;if(!im||!im.complete||!im.naturalWidth)return false;
 const s=Math.min(im.naturalWidth,im.naturalHeight),sx=(im.naturalWidth-s)/2,sy=(im.naturalHeight-s)/2;
 c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.clip();c.drawImage(im,sx,sy,s,s,x-r,y-r,r*2,r*2);c.restore();return true;
}
let raf=0,last=0,running=false,destroyed=false;
function loop(ts){
 if(!running)return;
 raf=requestAnimationFrame(loop);
 // El prototipo avanza un paso por fotograma a 60 Hz; en pantallas de 120 Hz se salta uno de cada dos
 // para que la velocidad de caminata sea la misma en todos los móviles.
 if(ts-last<15.5)return;
 last=ts;
 try{frame()}catch(e){running=false;cancelAnimationFrame(raf);if(hooks.onError)hooks.onError(e)}
}
function renderStill(){if(destroyed)return;try{snap();frame()}catch(e){if(hooks.onError)hooks.onError(e)}}
function onCanvasClick(e){
 if(renderWorld!==2)return;
 const rect=cv.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const x=(e.clientX-rect.left)*W/rect.width,y=(e.clientY-rect.top)*H/rect.height;
 const hit=planetTargets.find(p=>Math.hypot(x-p.x,y-p.y)<p.r+13);
 if(hit&&hooks.onPlanet)hooks.onPlanet(hit.name);
}
cv.addEventListener('click',onCanvasClick);
function resize(){
 dpr=Math.min(window.devicePixelRatio||1,2);
 cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
}
resize();
return {
 // list: [{id,name,letter,color,points,photo}] — points = total de puntos GANADOS (nunca el saldo).
 setKids(list,selectedId){
  const prev=new Map(kids.map(k=>[k.id,k]));
  kids.length=0;
  for(const it of list){
   const p=Math.max(0,Math.floor(Number.isFinite(it.points)?it.points:0)),old=prev.get(it.id);
   kids.push({id:it.id,name:it.name,letter:it.letter,color:it.color,photo:it.photo||null,p,display:old?old.display:p});
  }
  const idx=kids.findIndex(k=>k.id===selectedId);
  selected=idx>=0?idx:0;
  if(!firstSync){firstSync=true;snap();emitWorld(activeWorld)}
  if(reducedMotion)renderStill();else if(kids[selected])choose(selected);
 },
 select(id){
  const idx=kids.findIndex(k=>k.id===id);if(idx<0)return;
  if(reducedMotion){selected=idx;renderStill();return}
  choose(idx);
 },
 start(){if(running||destroyed||reducedMotion)return;running=true;last=0;raf=requestAnimationFrame(loop)},
 stop(){running=false;cancelAnimationFrame(raf)},
 destroy(){destroyed=true;running=false;cancelAnimationFrame(raf);cv.removeEventListener('click',onCanvasClick)},
};

}
