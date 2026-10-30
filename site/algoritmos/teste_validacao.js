
'use strict';

const assert = require('node:assert/strict');

const {
    buscaLinear,
    selectionSort,
    mergeSort
} = require('./ordenacao');

console.log('=== BIOIOT - VALIDAÇÃO DOS ALGORITMOS ===\n');

const casos = [
    {
        nome: 'Array vazio',
        entrada: [],
        esperado: []
    },
    {
        nome: 'Um elemento',
        entrada: [75],
        esperado: [75]
    },
    {
        nome: 'Valores repetidos',
        entrada: [80, 75, 80, 70, 75],
        esperado: [70, 75, 75, 80, 80]
    },
    {
        nome: 'Já ordenado',
        entrada: [60, 70, 80, 90],
        esperado: [60, 70, 80, 90]
    },
    {
        nome: 'Ordem inversa',
        entrada: [100, 90, 80, 70],
        esperado: [70, 80, 90, 100]
    },
    {
        nome: 'Números negativos',
        entrada: [-5, 10, -20, 0],
        esperado: [-20, -5, 0, 10]
    },
    {
        nome: 'Valores simulados de BPM',
        entrada: [89, 73, 95, 81, 76, 92, 68],
        esperado: [68, 73, 76, 81, 89, 92, 95]
    }
];

for (const caso of casos) {
    const original = [...caso.entrada];

    const resultadoSelection = selectionSort(caso.entrada);
    const resultadoMerge = mergeSort(caso.entrada);

    assert.deepEqual(resultadoSelection, caso.esperado);
    assert.deepEqual(resultadoMerge, caso.esperado);

    // Os algoritmos não podem modificar a entrada original.
    assert.deepEqual(caso.entrada, original);

    // As implementações devem produzir novos arrays.
    assert.notStrictEqual(resultadoSelection, caso.entrada);
    assert.notStrictEqual(resultadoMerge, caso.entrada);

    console.log(`OK - ${caso.nome}`);
}

// Testes específicos da busca linear.
const medicoes = [68, 69, 75, 69, 80];

assert.equal(buscaLinear(medicoes, 68), 0);
assert.equal(buscaLinear(medicoes, 69), 1);
assert.equal(buscaLinear(medicoes, 80), 4);
assert.equal(buscaLinear(medicoes, 100), -1);
assert.equal(buscaLinear([], 70), -1);

console.log('OK - Busca linear');

// Teste com uma amostra maior e reproduzível.
const dadosGrandes = Array.from(
    { length: 1000 },
    (_, i) => 60 + ((i * 37 + 13) % 61)
);

const esperadoGrande = [...dadosGrandes].sort((a, b) => a - b);

assert.deepEqual(selectionSort(dadosGrandes), esperadoGrande);
assert.deepEqual(mergeSort(dadosGrandes), esperadoGrande);

console.log('OK - Ordenação de 1.000 valores');

// Verificação final dos dados originais.
assert.deepEqual(
    dadosGrandes,
    Array.from(
        { length: 1000 },
        (_, i) => 60 + ((i * 37 + 13) % 61)
    )
);

console.log('OK - Preservação dos dados originais');

console.log('\nTODOS OS TESTES DE VALIDAÇÃO PASSARAM!');
