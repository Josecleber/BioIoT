
'use strict';

// Merge Sort estável para registros com BPM.
// Preserva o conteúdo e a ordem relativa dos empates.
function mergeSortRegistros(registros) {
    let comparacoes = 0;

    function ordenar(lista) {
        if (lista.length <= 1) return [...lista];

        const meio = Math.floor(lista.length / 2);
        const esquerda = ordenar(lista.slice(0, meio));
        const direita = ordenar(lista.slice(meio));

        const resultado = [];
        let i = 0;
        let j = 0;

        while (i < esquerda.length && j < direita.length) {
            comparacoes++;

            if (esquerda[i].bpm <= direita[j].bpm) {
                resultado.push(esquerda[i++]);
            } else {
                resultado.push(direita[j++]);
            }
        }

        while (i < esquerda.length) resultado.push(esquerda[i++]);
        while (j < direita.length) resultado.push(direita[j++]);

        return resultado;
    }

    return {
        registros: ordenar(registros),
        comparacoes
    };
}

// Selection Sort para comparar complexidade.
function selectionSortRegistros(registros) {
    const dados = [...registros];
    let comparacoes = 0;

    for (let i = 0; i < dados.length - 1; i++) {
        let menor = i;

        for (let j = i + 1; j < dados.length; j++) {
            comparacoes++;

            if (dados[j].bpm < dados[menor].bpm) {
                menor = j;
            }
        }

        if (menor !== i) {
            [dados[i], dados[menor]] = [dados[menor], dados[i]];
        }
    }

    return { registros: dados, comparacoes };
}

// Busca todas as ocorrências de um BPM.
function buscaLinearRegistros(registros, bpm) {
    const encontrados = [];
    let verificacoes = 0;

    for (const registro of registros) {
        verificacoes++;

        if (registro.bpm === bpm) encontrados.push(registro);
    }

    return { encontrados, verificacoes };
}

// Compatibilidade com Node.js e navegador.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        mergeSortRegistros,
        selectionSortRegistros,
        buscaLinearRegistros
    };
}

if (typeof window !== 'undefined') {
    window.BioIoTAlgoritmos = {
        mergeSortRegistros,
        selectionSortRegistros,
        buscaLinearRegistros
    };
}
