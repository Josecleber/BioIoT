
'use strict';

function analisarMergeSort(valores) {
    const estatisticas = {
        chamadas: 0,
        profundidadeMaxima: 0,
        comparacoes: 0
    };

    function ordenar(lista, profundidade) {
        estatisticas.chamadas++;
        estatisticas.profundidadeMaxima = Math.max(
            estatisticas.profundidadeMaxima,
            profundidade
        );

        if (lista.length <= 1) {
            return [...lista];
        }

        const meio = Math.floor(lista.length / 2);

        const esquerda = ordenar(lista.slice(0, meio), profundidade + 1);
        const direita = ordenar(lista.slice(meio), profundidade + 1);

        const resultado = [];
        let i = 0;
        let j = 0;

        while (i < esquerda.length && j < direita.length) {
            estatisticas.comparacoes++;

            if (esquerda[i] <= direita[j]) {
                resultado.push(esquerda[i++]);
            } else {
                resultado.push(direita[j++]);
            }
        }

        while (i < esquerda.length) resultado.push(esquerda[i++]);
        while (j < direita.length) resultado.push(direita[j++]);

        return resultado;
    }

    const ordenados = ordenar(valores, 0);

    return { ordenados, estatisticas };
}

console.log('=== BIOIOT - ANALISE DE RECURSIVIDADE ===');

for (const n of [8, 16, 32, 64, 128, 256, 512, 1024]) {
    const dados = Array.from(
        { length: n },
        (_, i) => n - i
    );

    const { ordenados, estatisticas } = analisarMergeSort(dados);

    if (ordenados.length !== n || ordenados[0] !== 1 ||
        ordenados[n - 1] !== n) {
        throw new Error('Falha na ordenacao');
    }

    console.log(
        `n=${n} | Chamadas=${estatisticas.chamadas}` +
        ` | Profundidade=${estatisticas.profundidadeMaxima}` +
        ` | Comparacoes=${estatisticas.comparacoes}`
    );
}

console.log('Analise concluida com sucesso!');