// ==========================================
// ELEMENTOS DA PÁGINA
// ==========================================

const tipo =
    document.getElementById("tipo");

const municipio =
    document.getElementById("municipio");

const entidade =
    document.getElementById("entidade");

const relatorio =
    document.getElementById("relatorio");

const ano =
    document.getElementById("ano");

const periodo =
    document.getElementById("periodo");

const botao =
    document.getElementById("btnConsultar");

const textoBotao =
    document.getElementById("textoBotao");

const resultado =
    document.getElementById("resultado");

const statusConsulta =
    document.getElementById("statusConsulta");

const rclAjustada =
    document.getElementById("rclAjustada");

const dtp =
    document.getElementById("dtp");

const indice =
    document.getElementById("indice");

const resultadoMunicipio =
    document.getElementById("resultadoMunicipio");

const resultadoAno =
    document.getElementById("resultadoAno");

const resultadoPeriodo =
    document.getElementById("resultadoPeriodo");

const mensagemResultado =
    document.getElementById("mensagemResultado");


// ==========================================
// FORMATAR DINHEIRO
// ==========================================

function formatarMoeda(valor) {

    if (
        valor === null ||
        valor === undefined ||
        Number.isNaN(Number(valor))
    ) {
        return "—";
    }

    return new Intl.NumberFormat(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    ).format(Number(valor));
}


// ==========================================
// FORMATAR PORCENTAGEM
// ==========================================

function formatarPorcentagem(valor) {

    if (
        valor === null ||
        valor === undefined ||
        Number.isNaN(Number(valor))
    ) {
        return "—";
    }

    return Number(valor).toLocaleString(
        "pt-BR",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    ) + "%";
}


// ==========================================
// NOME DO PERÍODO
// ==========================================

function nomePeriodo(valor) {

    const periodos = {

        "1": "Janeiro",
        "2": "Fevereiro",
        "3": "Março",
        "4": "Abril",
        "5": "Maio",
        "6": "Junho",
        "7": "Julho",
        "8": "Agosto",
        "9": "Setembro",
        "10": "Outubro",
        "11": "Novembro",
        "12": "Dezembro"
    };

    return periodos[valor] || valor;
}


// ==========================================
// CONSULTAR
// ==========================================

botao.addEventListener(
    "click",
    async function () {

        const tipoValor =
            tipo.value;

        const municipioValor =
            municipio.value;

        const entidadeValor =
            entidade.value;

        const relatorioValor =
            relatorio.value;

        const anoValor =
            ano.value;

        const periodoValor =
            periodo.value;


        // ==========================================
        // VALIDAR CAMPOS
        // ==========================================

        if (
            !tipoValor ||
            !municipioValor ||
            !entidadeValor ||
            !relatorioValor ||
            !anoValor ||
            !periodoValor
        ) {

            resultado.style.display =
                "block";

            statusConsulta.textContent =
                "Atenção";

            mensagemResultado.className =
                "mensagem erro";

            mensagemResultado.textContent =
                "Preencha todos os campos antes de realizar a consulta.";

            return;
        }


        // ==========================================
        // MOSTRAR RESULTADO
        // ==========================================

        resultado.style.display =
            "block";

        statusConsulta.textContent =
            "Consultando...";

        rclAjustada.textContent =
            "—";

        dtp.textContent =
            "—";

        indice.textContent =
            "—";

        resultadoMunicipio.textContent =
            municipio.options[
                municipio.selectedIndex
            ].text;

        resultadoAno.textContent =
            anoValor;

        resultadoPeriodo.textContent =
            nomePeriodo(
                periodoValor
            );

        mensagemResultado.className =
            "mensagem";

        mensagemResultado.textContent =
            "O sistema está consultando o TCE-PR. Isso pode levar alguns segundos.";


        // ==========================================
        // DESABILITAR BOTÃO
        // ==========================================

        botao.disabled =
            true;

        textoBotao.textContent =
            "Consultando TCE-PR...";


        try {

            // ==========================================
            // ENVIAR PARA O SERVER.JS
            // ==========================================

            const resposta =
                await fetch(
                    "/api/consulta",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                tipo:
                                    tipoValor,

                                municipio:
                                    municipioValor,

                                entidade:
                                    entidadeValor,

                                relatorio:
                                    relatorioValor,

                                ano:
                                    anoValor,

                                periodo:
                                    periodoValor
                            })
                    }
                );


            // ==========================================
            // TRANSFORMAR RESPOSTA EM JSON
            // ==========================================

            const dados =
                await resposta.json();


            // ==========================================
            // VERIFICAR ERRO
            // ==========================================

            if (!resposta.ok) {

                throw new Error(

                    dados.erro ||

                    dados.mensagem ||

                    "Não foi possível realizar a consulta."
                );
            }


            // ==========================================
            // VERIFICAR SUCESSO
            // ==========================================

            if (
                dados.sucesso === false
            ) {

                throw new Error(

                    dados.erro ||

                    "O TCE-PR não conseguiu realizar a consulta."
                );
            }


            // ==========================================
            // MOSTRAR DADOS
            // ==========================================

            rclAjustada.textContent =
                formatarMoeda(
                    dados.rclAjustada
                );

            dtp.textContent =
                formatarMoeda(
                    dados.dtp
                );

            indice.textContent =
                formatarPorcentagem(
                    dados.indice
                );


            // ==========================================
            // STATUS
            // ==========================================

            statusConsulta.textContent =
                "Consulta concluída";

            mensagemResultado.className =
                "mensagem";

            mensagemResultado.textContent =
                "Os dados foram extraídos automaticamente do relatório do TCE-PR.";


            // ==========================================
            // CONSOLE
            // ==========================================

            console.log(
                "Resultado recebido:",
                dados
            );


        } catch (erro) {

            console.error(
                "Erro na consulta:",
                erro
            );


            // ==========================================
            // MOSTRAR ERRO
            // ==========================================

            statusConsulta.textContent =
                "Erro";

            mensagemResultado.className =
                "mensagem erro";

            mensagemResultado.textContent =
                erro.message ||
                "Ocorreu um erro durante a consulta.";

        } finally {

            // ==========================================
            // LIBERAR BOTÃO
            // ==========================================

            botao.disabled =
                false;

            textoBotao.textContent =
                "Consultar TCE-PR";
        }
    }
);