/* Web BASIC 2.0 - Built-in Sample Programs */
(function (global) {
  'use strict';

  var WB = global.WebBasic = global.WebBasic || {};

  WB.SAMPLES = [
    {
      id: 'DEMO',
      title: '1. N88 Graphics Demo',
      desc: 'LINE / CIRCLE / PAINT / SYMBOL を使ったカラフルなグラフィックスデモ',
      code: [
        '10 SCREEN 640,400 : CLS 3',
        '20 FOR I=0 TO 31',
        '30 COLOR (I MOD 15)+1',
        '40 LINE (I*20,0)-(639,I*12)',
        '50 LINE (639-I*20,399)-(0,399-I*12)',
        '60 NEXT I',
        '70 COLOR 7 : CIRCLE (320,200),110,7',
        '80 PAINT (320,200),1,7',
        '90 CIRCLE (320,200),75,6',
        '100 PAINT (320,200),2,6',
        '110 SYMBOL (195,185),"WEB BASIC 2.0",2,2,7',
        '120 PLAY "T160 O5 L8 C E G > C4"',
        '130 END'
      ].join('\n')
    },
    {
      id: 'MANDEL',
      title: '2. Mandelbrot Set (Speed Test)',
      desc: '高速化されたN88-BASICエンジンによるマンデルブロ集合描画＆TIMER計測',
      code: [
        '10 SCREEN 320,200 : CLS 3',
        '20 T0=TIMER',
        '30 FOR PY=0 TO 199',
        '40 CI=-1.2+PY*2.4/199',
        '50 FOR PX=0 TO 319',
        '60 CR=-2.2+PX*3.0/319',
        '70 ZR=0 : ZI=0 : N=0',
        '80 WHILE N<24 AND (ZR*ZR+ZI*ZI)<=4',
        '90 TR=ZR*ZR-ZI*ZI+CR',
        '100 ZI=2*ZR*ZI+CI : ZR=TR : N=N+1',
        '110 WEND',
        '120 IF N<24 THEN PSET (PX,PY),(N MOD 15)+1',
        '130 NEXT PX : NEXT PY',
        '140 DT=INT((TIMER-T0)*1000)/1000',
        '150 COLOR 7 : LOCATE 1,1 : PRINT "TIME:";DT;"SEC"',
        '160 END'
      ].join('\n')
    },
    {
      id: 'CLOCK',
      title: '3. Analog Clock (VSYNC)',
      desc: 'TIME$ と SIN/COS/VSYNC を使ったリアルタイム・アナログ時計',
      code: [
        '10 SCREEN 640,400 : CLS 3',
        '20 CX=320 : CY=200 : R=150',
        '30 WHILE INKEY$=""',
        '40 CLS 2',
        '50 CIRCLE (CX,CY),R,5',
        '60 FOR H=0 TO 11',
        '70 A=RAD(H*30-90)',
        '80 LINE (CX+COS(A)*(R-14),CY+SIN(A)*(R-14))-(CX+COS(A)*(R-4),CY+SIN(A)*(R-4)),7',
        '90 NEXT H',
        '100 T$=TIME$',
        '110 HH=VAL(LEFT$(T$,2)) MOD 12 : MM=VAL(MID$(T$,4,2)) : SS=VAL(RIGHT$(T$,2))',
        '120 AH=RAD((HH*30+MM*0.5)-90) : AM=RAD(MM*6-90) : AS=RAD(SS*6-90)',
        '130 LINE (CX,CY)-(CX+COS(AH)*85,CY+SIN(AH)*85),6',
        '140 LINE (CX,CY)-(CX+COS(AM)*120,CY+SIN(AM)*120),4',
        '150 LINE (CX,CY)-(CX+COS(AS)*135,CY+SIN(AS)*135),2',
        '160 SYMBOL (245,365),T$,2,2,7',
        '170 VSYNC',
        '180 WEND',
        '190 END'
      ].join('\n')
    },
    {
      id: 'SPRITE',
      title: '4. Sprite Bounce (GSAVE / GPUT)',
      desc: 'GSAVE と GPUT(TRANS) を使った高速スプライト移動デモ',
      code: [
        '10 SCREEN 320,200 : CLS 3',
        '20 CIRCLE (16,16),14,6,0,6.29,1,F',
        '30 CIRCLE (11,12),2,0,0,6.29,1,F',
        '40 CIRCLE (21,12),2,0,0,6.29,1,F',
        '50 LINE (10,20)-(22,20),2',
        '60 GSAVE "HERO",0,0,32,32',
        '70 X=140 : Y=80 : DX=3 : DY=2',
        '80 WHILE INKEY$=""',
        '90 CLS 2',
        '100 LINE (0,0)-(319,199),5,B',
        '110 SYMBOL (10,8),"PRESS ANY KEY OR STOP",1,1,7',
        '120 GPUT "HERO",X,Y,TRANS',
        '130 X=X+DX : Y=Y+DY',
        '140 IF X<4 OR X>284 THEN DX=-DX : BEEP 660,30',
        '150 IF Y<24 OR Y>164 THEN DY=-DY : BEEP 880,30',
        '160 VSYNC',
        '170 WEND',
        '180 END'
      ].join('\n')
    },
    {
      id: 'MUSIC',
      title: '5. MML Music Player (PLAY)',
      desc: 'N88-BASIC 風 MML (PLAY文) によるレトロサウンド演奏',
      code: [
        '10 SCREEN 640,400 : CLS 3',
        '20 COLOR 6 : LOCATE 8,4 : PRINT "N88-WEB BASIC MML PLAYER"',
        '30 PLAY "T140 O4 L8 V10 E E F G G F E D C C D E E. D16 D4"',
        '40 FOR I=1 TO 40',
        '50 C=(I MOD 7)+1',
        '60 CIRCLE (320,220),I*4,C',
        '70 WAIT 60',
        '80 NEXT I',
        '90 PLAY "T140 O4 L8 V10 E E F G G F E D C C D E D. C16 C4"',
        '100 END'
      ].join('\n')
    },
    {
      id: 'LIFE',
      title: '6. Conway Game of Life',
      desc: 'DIM 2次元配列と PSET によるライフゲーム',
      code: [
        '10 SCREEN 320,200 : CLS 3 : RANDOMIZE',
        '20 W=40 : H=25 : DIM A(41,26), B(41,26)',
        '30 FOR Y=1 TO H : FOR X=1 TO W',
        '40 IF RND>0.72 THEN A(X,Y)=1',
        '50 NEXT X : NEXT Y',
        '60 WHILE INKEY$=""',
        '70 CLS 2',
        '80 FOR Y=1 TO H : FOR X=1 TO W',
        '90 IF A(X,Y)=1 THEN LINE (X*8-7,Y*8-7)-(X*8-1,Y*8-1),4,BF',
        '100 N=A(X-1,Y-1)+A(X,Y-1)+A(X+1,Y-1)+A(X-1,Y)+A(X+1,Y)+A(X-1,Y+1)+A(X,Y+1)+A(X+1,Y+1)',
        '110 IF A(X,Y)=1 AND (N=2 OR N=3) THEN B(X,Y)=1 ELSE IF A(X,Y)=0 AND N=3 THEN B(X,Y)=1 ELSE B(X,Y)=0',
        '120 NEXT X : NEXT Y',
        '130 FOR Y=1 TO H : FOR X=1 TO W : A(X,Y)=B(X,Y) : NEXT X : NEXT Y',
        '140 VSYNC',
        '150 WEND : END'
      ].join('\n')
    }
  ];
})(window);
