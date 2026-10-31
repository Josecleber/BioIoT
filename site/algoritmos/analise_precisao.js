
'use strict';

const assert = require('node:assert/strict');

console.log('=== BIOIOT - PRECISAO NUMERICA ===\n');

// Dados ilustrativos. Não são medições reais.
const leituras = [
    { bpm: 72.4, spo2: 98.7 },
    { bpm: 72.6, spo2: 98.9 },
    { bpm: 73.2, spo2: 99.1 },
    { bpm: 73.8, spo2: 99.4 },
    { bpm: 74.3, spo2: 99.6 }
];

function media(valores) {
    if (valores.length === 0) {
        throw new Error('Lista vazia');
    }

    let soma = 0;
    for (const valor of valores) soma += valor;

    return soma / valores.length;
}

function erroAbsoluto(original, arredondado) {
    return Math.abs(original - arredondado);
}

console.log('BPM original | BPM inteiro | Erro absoluto');

for (const leitura of leituras) {
    const inteiro = Math.round(leitura.bpm);
    const erro = erroAbsoluto(leitura.bpm, inteiro);

    assert.ok(erro <= 0.5);

    console.log(
        `${leitura.bpm.toFixed(1).padStart(12)} | ` +
        `${String(inteiro).padStart(11)} | ` +
        erro.toFixed(2)
    );
}

const valoresOriginais = leituras.map(l => l.bpm);
const valoresInteiros = valoresOriginais.map(Math.round);

const mediaOriginal = media(valoresOriginais);
const mediaArredondada = media(valoresInteiros);

console.log('\nMedia dos BPMs originais:', mediaOriginal.toFixed(4));
console.log('Media dos BPMs arredondados:', mediaArredondada.toFixed(4));
console.log(
    'Diferenca entre as medias:',
    erroAbsoluto(mediaOriginal, mediaArredondada).toFixed(4)
);

// Ilustração da aritmética de ponto flutuante.
const resultado = 0.1 + 0.2;

console.log('\n0.1 + 0.2 em JavaScript =', resultado);

assert.ok(Math.abs(resultado - 0.3) < 1e-12);

console.log(
    '\nConclusao: numeros decimais em computadores possuem ' +
    'representacao finita e podem apresentar arredondamentos.'
);

console.log('Experimento concluido com sucesso!');