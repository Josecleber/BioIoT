
'use strict';

const assert = require('node:assert/strict');

// Amostra fictícia no formato das leituras do BioIoT.
const registros = [
    { id: 5, bpm: 80, spo2: 98, timestamp: '2026-10-30 10:05:00' },
    { id: 4, bpm: 70, spo2: 97, timestamp: '2026-10-30 10:04:00' },
    { id: 3, bpm: 80, spo2: 99, timestamp: '2026-10-30 10:03:00' },
    { id: 2, bpm: 65, spo2: 96, timestamp: '2026-10-30 10:02:00' },
    { id: 1, bpm: 70, spo2: 98, timestamp: '2026-10-30 10:01:00' }
];

function mergeSortRegistros(lista) {
    if (lista.length <= 1) return [...lista];

    const meio = Math.floor(lista.length / 2);
    const esquerda = mergeSortRegistros(lista.slice(0, meio));
    const direita = mergeSortRegistros(lista.slice(meio));

    const resultado = [];
    let i = 0;
    let j = 0;

    while (i < esquerda.length && j < direita.length) {
        if (esquerda[i].bpm <= direita[j].bpm) {
            resultado.push(esquerda[i++]);
        } else {
            resultado.push(direita[j++]);
        }
    }

    return resultado.concat(esquerda.slice(i), direita.slice(j));
}

console.log('=== BIOIOT - TESTE DE REGISTROS ===');

const original = structuredClone(registros);
const ordenados = mergeSortRegistros(registros);

// Verifica a ordenação crescente.
assert.deepEqual(
    ordenados.map(r => r.bpm),
    [65, 70, 70, 80, 80]
);

console.log('OK - BPM em ordem crescente');

// Verifica se nenhum ID foi perdido.
assert.deepEqual(
    [...ordenados.map(r => r.id)].sort((a, b) => a - b),
    [1, 2, 3, 4, 5]
);

console.log('OK - Todos os IDs preservados');

// Verifica se os registros completos continuam intactos.
const porId = new Map(original.map(r => [r.id, r]));

for (const registro of ordenados) {
    assert.deepEqual(registro, porId.get(registro.id));
}

console.log('OK - SpO2, timestamps e demais dados preservados');

// Verifica a estabilidade do Merge Sort nos empates.
assert.deepEqual(
    ordenados.filter(r => r.bpm === 70).map(r => r.id),
    [4, 1]
);

assert.deepEqual(
    ordenados.filter(r => r.bpm === 80).map(r => r.id),
    [5, 3]
);

console.log('OK - Ordem original preservada nos empates');

// Confirma que o array original não foi modificado.
assert.deepEqual(registros, original);

console.log('OK - Registros originais não modificados');

console.log('\nTODOS OS TESTES DE REGISTROS PASSARAM!');
