const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const app = express();

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const PORT = process.env.PORT || 3000;

const URL =
    "https://simam.tce.pr.gov.br/Paginas/Rel_LRF.aspx?relTipo=1";

const ANO_INICIAL = 2019;

app.use(express.json());
app.use(express.static(__dirname));

let browser = null;
let context = null;
let page = null;

let municipiosCache = [];
let pronto = false;

// ======================================================
// ANO / MÊS
// ======================================================

function obterAnoAtual() {
    return new Date().getFullYear();
}

function obterMesAtual() {
    return new Date().getMonth() + 1;
}

function gerarAnos() {
    const anoAtual = obterAnoAtual();
    const anos = [];

    for (
        let ano = ANO_INICIAL;
        ano <= anoAtual;
        ano++
    ) {
        anos.push(String(ano));
    }

    return anos;
}

// ======================================================
// NÚMERO BRASILEIRO
// ======================================================

function numeroBR(valor) {
    if (
        valor === null ||
        valor === undefined
    ) {
        return NaN;
    }

    let texto = String(valor)
        .replace(/\s/g, "")
        .trim();

    if (!texto) {
        return NaN;
    }

    // Remove R$
    texto = texto.replace(/[R$]/g, "");

    // Formato brasileiro:
    // 38.452.542,80

    if (texto.includes(",")) {
        texto = texto
            .replace(/\./g, "")
            .replace(",", ".");
    }

    return Number(texto);
}

// ======================================================
// FORMATAR BR
// ======================================================

function formatarBR(valor) {
    if (
        valor === null ||
        valor === undefined
    ) {
        return "-";
    }

    if (Number.isNaN(Number(valor))) {
        return "-";
    }

    return Number(valor).toLocaleString(
        "pt-BR",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
}

// ======================================================
// LIMPAR TEXTO
// ======================================================

function limparTexto(texto) {
    return String(texto)
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ======================================================
// ENCONTRAR NÚMERO BRASILEIRO
// ======================================================

function encontrarNumeroBR(texto) {
    if (!texto) {
        return null;
    }

    const encontrados = texto.match(
        /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g
    );

    if (
        !encontrados ||
        encontrados.length === 0
    ) {
        return null;
    }

    return encontrados[0];
}

// ======================================================
// EXTRAIR VALOR DEPOIS DE UM TEXTO
// ======================================================

function extrairValorPorMarcador(
    texto,
    marcadores
) {
    const textoNormalizado =
        limparTexto(texto);

    for (const marcador of marcadores) {
        const indice =
            textoNormalizado
                .toUpperCase()
                .indexOf(
                    marcador.toUpperCase()
                );

        if (indice === -1) {
            continue;
        }

        const trecho =
            textoNormalizado.substring(
                indice + marcador.length
            );

        const numero =
            encontrarNumeroBR(trecho);

        if (numero) {
            return numero;
        }
    }

    return null;
}

// ======================================================
// EXTRAIR DADOS DO RELATÓRIO
// ======================================================

function extrairDadosRelatorio(texto) {

    const textoLimpo =
        limparTexto(texto);

    console.log("");
    console.log("=================================");
    console.log("EXTRAINDO DADOS DO RELATÓRIO");
    console.log("=================================");

    // ==================================================
    // RCL
    // ==================================================

    const rclTexto =
        extrairValorPorMarcador(
            textoLimpo,
            [
                "RECEITA CORRENTE LÍQUIDA - RCL (IV)",
                "RECEITA CORRENTE LÍQUIDA - RCL",
                "RECEITA CORRENTE LÍQUIDA"
            ]
        );

    // ==================================================
    // RCL AJUSTADA
    // ==================================================

    const rclAjustadaTexto =
        extrairValorPorMarcador(
            textoLimpo,
            [
                "RECEITA CORRENTE LÍQUIDA AJUSTADA PARA CÁLCULO DOS LIMITES DA DESPESA COM PESSOAL",
                "RECEITA CORRENTE LÍQUIDA AJUSTADA"
            ]
        );

    // ==================================================
    // DESPESA TOTAL COM PESSOAL
    // ==================================================

    const dtpTexto =
        extrairValorPorMarcador(
            textoLimpo,
            [
                "DESPESA TOTAL COM PESSOAL - DTP (VIII)",
                "DESPESA TOTAL COM PESSOAL - DTP",
                "DESPESA TOTAL COM PESSOAL"
            ]
        );

    console.log("");
    console.log(
        "VALORES ENCONTRADOS PELOS MARCADORES:"
    );
    console.log("---------------------------------");

    console.log("RCL:", rclTexto);
    console.log(
        "RCL Ajustada:",
        rclAjustadaTexto
    );
    console.log("DTP:", dtpTexto);

    // ==================================================
    // VALIDAR
    // ==================================================

    if (!rclTexto) {
        throw new Error(
            "Não foi possível localizar a Receita Corrente Líquida (RCL) no relatório."
        );
    }

    if (!rclAjustadaTexto) {
        throw new Error(
            "Não foi possível localizar a Receita Corrente Líquida Ajustada no relatório."
        );
    }

    if (!dtpTexto) {
        throw new Error(
            "Não foi possível localizar a Despesa Total com Pessoal (DTP) no relatório."
        );
    }

    // ==================================================
    // CONVERTER
    // ==================================================

    const rcl =
        numeroBR(rclTexto);

    const rclAjustada =
        numeroBR(rclAjustadaTexto);

    const dtp =
        numeroBR(dtpTexto);

    if (
        Number.isNaN(rcl) ||
        Number.isNaN(rclAjustada) ||
        Number.isNaN(dtp)
    ) {
        throw new Error(
            "Erro ao converter os valores encontrados no relatório."
        );
    }

    // ==================================================
    // PERCENTUAL
    // ==================================================

    const percentual =
        rclAjustada > 0
            ? (dtp / rclAjustada) * 100
            : 0;

    // ==================================================
    // LIMITES DA LRF
    // ==================================================

    const limiteAlertaPercentual = 48.6;
    const limitePrudencialPercentual = 51.3;
    const limiteMaximoPercentual = 54;

    const limiteAlerta =
        rclAjustada *
        (limiteAlertaPercentual / 100);

    const limitePrudencial =
        rclAjustada *
        (limitePrudencialPercentual / 100);

    const limiteMaximo =
        rclAjustada *
        (limiteMaximoPercentual / 100);

    // ==================================================
    // SITUAÇÃO
    // ==================================================

    let situacao = "OK";

    if (
        percentual >=
        limiteMaximoPercentual
    ) {
        situacao =
            "ACIMA DO LIMITE MÁXIMO";

    } else if (
        percentual >=
        limitePrudencialPercentual
    ) {
        situacao =
            "LIMITE PRUDENCIAL";

    } else if (
        percentual >=
        limiteAlertaPercentual
    ) {
        situacao =
            "LIMITE DE ALERTA";
    }

    // ==================================================
    // LOG
    // ==================================================

    console.log("");
    console.log("=================================");
    console.log("RESULTADO");
    console.log("=================================");

    console.log(
        "RCL:",
        formatarBR(rcl)
    );

    console.log(
        "RCL Ajustada:",
        formatarBR(rclAjustada)
    );

    console.log(
        "Despesa com Pessoal:",
        formatarBR(dtp)
    );

    console.log(
        "Percentual:",
        percentual.toFixed(2) + "%"
    );

    console.log(
        "Limite de alerta:",
        formatarBR(limiteAlerta),
        "(" +
        limiteAlertaPercentual +
        "%)"
    );

    console.log(
        "Limite prudencial:",
        formatarBR(limitePrudencial),
        "(" +
        limitePrudencialPercentual +
        "%)"
    );

    console.log(
        "Limite máximo:",
        formatarBR(limiteMaximo),
        "(" +
        limiteMaximoPercentual +
        "%)"
    );

    console.log(
        "Situação:",
        situacao
    );

    console.log(
        "================================="
    );

    // ==================================================
    // RETORNO
    // ==================================================

    return {

        rcl,

        rclFormatada:
            formatarBR(rcl),

        rclAjustada,

        rclAjustadaFormatada:
            formatarBR(rclAjustada),

        dtp,

        dtpFormatado:
            formatarBR(dtp),

        percentual,

        percentualFormatado:
            percentual.toFixed(2) + "%",

        // IMPORTANTE:
        // o frontend chama isso de "indice"
        indice: percentual,

        limiteAlerta,

        limiteAlertaFormatado:
            formatarBR(limiteAlerta),

        limiteAlertaPercentual,

        limitePrudencial,

        limitePrudencialFormatado:
            formatarBR(limitePrudencial),

        limitePrudencialPercentual,

        limiteMaximo,

        limiteMaximoFormatado:
            formatarBR(limiteMaximo),

        limiteMaximoPercentual,

        situacao
    };
}

// ======================================================
// CALCULAR EVOLUÇÃO
// ======================================================

function calcularEvolucao(
    valorAtual,
    valorAnterior
) {

    if (
        valorAnterior === null ||
        valorAnterior === undefined ||
        Number.isNaN(Number(valorAnterior)) ||
        Number(valorAnterior) === 0
    ) {
        return null;
    }

    return (
        (
            (Number(valorAtual) -
                Number(valorAnterior)) /
            Number(valorAnterior)
        ) * 100
    );
}

// ======================================================
// CALCULAR EVOLUÇÃO ACUMULADA
// ======================================================

function calcularEvolucaoAcumulada(
    valorAtual,
    valorBase
) {

    if (
        valorBase === null ||
        valorBase === undefined ||
        Number.isNaN(Number(valorBase)) ||
        Number(valorBase) === 0
    ) {
        return null;
    }

    return (
        (
            (Number(valorAtual) -
                Number(valorBase)) /
            Number(valorBase)
        ) * 100
    );
}

// ======================================================
// FORMATAR PERCENTUAL DE EVOLUÇÃO
// ======================================================

function formatarPercentualEvolucao(valor) {

    if (
        valor === null ||
        valor === undefined ||
        Number.isNaN(Number(valor))
    ) {
        return "-";
    }

    const numero = Number(valor);

    const sinal =
        numero > 0
            ? "+"
            : "";

    return (
        sinal +
        numero
            .toFixed(2)
            .replace(".", ",") +
        "%"
    );
}

// ======================================================
// CALCULAR HISTÓRICO
// ======================================================

function calcularHistorico(historico) {

    if (
        !historico ||
        historico.length === 0
    ) {
        return [];
    }

    const base =
        historico[0];

    return historico.map(
        (item, index) => {

            const anterior =
                index > 0
                    ? historico[index - 1]
                    : null;

            const evolucaoRCL =
                calcularEvolucao(
                    item.rcl,
                    anterior
                        ? anterior.rcl
                        : null
                );

            const acumuladoRCL =
                calcularEvolucaoAcumulada(
                    item.rcl,
                    base.rcl
                );

            const evolucaoRCLAjustada =
                calcularEvolucao(
                    item.rclAjustada,
                    anterior
                        ? anterior.rclAjustada
                        : null
                );

            const acumuladoRCLAjustada =
                calcularEvolucaoAcumulada(
                    item.rclAjustada,
                    base.rclAjustada
                );

            const evolucaoDTP =
                calcularEvolucao(
                    item.dtp,
                    anterior
                        ? anterior.dtp
                        : null
                );

            const acumuladoDTP =
                calcularEvolucaoAcumulada(
                    item.dtp,
                    base.dtp
                );

            return {

                ...item,

                evolucaoRCL,

                evolucaoRCLFormatada:
                    formatarPercentualEvolucao(
                        evolucaoRCL
                    ),

                acumuladoRCL,

                acumuladoRCLFormatado:
                    formatarPercentualEvolucao(
                        acumuladoRCL
                    ),

                evolucaoRCLAjustada,

                evolucaoRCLAjustadaFormatada:
                    formatarPercentualEvolucao(
                        evolucaoRCLAjustada
                    ),

                acumuladoRCLAjustada,

                acumuladoRCLAjustadaFormatado:
                    formatarPercentualEvolucao(
                        acumuladoRCLAjustada
                    ),

                evolucaoDTP,

                evolucaoDTPFormatada:
                    formatarPercentualEvolucao(
                        evolucaoDTP
                    ),

                acumuladoDTP,

                acumuladoDTPFormatado:
                    formatarPercentualEvolucao(
                        acumuladoDTP
                    )
            };
        }
    );
}

// ======================================================
// INICIAR TCE
// ======================================================

async function iniciarTCE() {

    console.log("");
    console.log("=================================");
    console.log("INICIANDO TCE-PR");
    console.log("=================================");

    console.log(
        "Abrindo página do TCE-PR..."
    );

    browser =
        await chromium.launch({

            headless: true,

            // Necessário para ambientes Linux
            // como o Render.
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage"
            ]
        });

    context =
        await browser.newContext();

    page =
        await context.newPage();

    await page.goto(
        URL,
        {
            waitUntil:
                "domcontentloaded",
            timeout: 60000
        }
    );

    await page.waitForTimeout(2000);

    console.log(
        "Página inicial carregada."
    );

    // ==================================================
    // TIPO DO ENTE
    // ==================================================

    const tipo =
        page.locator(
            "#ContentPlaceHolder1_ddlTipo"
        );

    await tipo.selectOption("1");

    await page.waitForTimeout(1200);

    // ==================================================
    // MUNICÍPIOS
    // ==================================================

    const municipioSelect =
        page.locator(
            "#ContentPlaceHolder1_ddlMunicipio"
        );

    const municipios =
        await municipioSelect
            .locator("option")
            .evaluateAll(
                options => {

                    return options
                        .map(option => ({

                            id:
                                option.value,

                            nome:
                                option
                                    .textContent
                                    .trim()
                        }))
                        .filter(
                            option =>
                                option.id &&
                                option.nome &&
                                !option.nome
                                    .toUpperCase()
                                    .includes(
                                        "SELECIONE"
                                    )
                        );
                }
            );

    municipiosCache =
        municipios;

    console.log(
        "Municípios encontrados:",
        municipiosCache.length
    );

    pronto = true;

    console.log(
        "TCE-PR pronto."
    );
}

// ======================================================
// STATUS
// ======================================================

app.get(
    "/api/status",
    (req, res) => {

        res.json({

            sucesso: true,

            pronto,

            municipios:
                municipiosCache.length,

            anoAtual:
                obterAnoAtual(),

            mesAtual:
                obterMesAtual(),

            anos:
                gerarAnos()
        });
    }
);

// ======================================================
// MUNICÍPIOS
// ======================================================

app.get(
    "/api/municipios",
    (req, res) => {

        res.json({

            sucesso: true,

            municipios:
                municipiosCache
        });
    }
);

// ======================================================
// ENTIDADES
// ======================================================

app.get(
    "/api/entidades",
    async (req, res) => {

        try {

            const municipioId =
                req.query.municipio;

            if (!municipioId) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            "Município não informado."
                    });
            }

            if (!page || !pronto) {

                return res
                    .status(503)
                    .json({

                        sucesso: false,

                        erro:
                            "O TCE-PR ainda está sendo inicializado. Aguarde alguns segundos."
                    });
            }

            console.log("");

            console.log(
                "Buscando entidades do município:",
                municipioId
            );

            await page
                .locator(
                    "#ContentPlaceHolder1_ddlMunicipio"
                )
                .selectOption(
                    municipioId
                );

            await page.waitForTimeout(
                700
            );

            const entidades =
                await page
                    .locator(
                        "#ContentPlaceHolder1_ddlEntidade option"
                    )
                    .evaluateAll(
                        options => {

                            return options
                                .map(
                                    option => ({

                                        id:
                                            option.value,

                                        nome:
                                            option
                                                .textContent
                                                .trim()
                                    })
                                )
                                .filter(
                                    option =>
                                        option.id &&
                                        option.nome &&
                                        !option.nome
                                            .toUpperCase()
                                            .includes(
                                                "SELECIONE"
                                            )
                                );
                        }
                    );

            console.log(
                "Entidades encontradas:",
                entidades.length
            );

            res.json({

                sucesso: true,

                entidades,

                cache: true
            });

        } catch (erro) {

            console.error(
                "Erro ao carregar entidades:",
                erro.message
            );

            res.status(500).json({

                sucesso: false,

                erro:
                    erro.message
            });
        }
    }
);

// ======================================================
// RELATÓRIOS
// ======================================================

app.get(
    "/api/relatorios",
    async (req, res) => {

        try {

            const municipioId =
                req.query.municipio;

            const entidadeId =
                req.query.entidade;

            if (!municipioId) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            "Município não informado."
                    });
            }

            if (!entidadeId) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            "Entidade não informada."
                    });
            }

            if (!page || !pronto) {

                return res
                    .status(503)
                    .json({

                        sucesso: false,

                        erro:
                            "O TCE-PR ainda está sendo inicializado. Aguarde alguns segundos."
                    });
            }

            console.log("");
            console.log("=================================");
            console.log("BUSCANDO RELATÓRIOS");
            console.log("=================================");

            await page
                .locator(
                    "#ContentPlaceHolder1_ddlMunicipio"
                )
                .selectOption(
                    municipioId
                );

            await page.waitForTimeout(
                500
            );

            await page
                .locator(
                    "#ContentPlaceHolder1_ddlEntidade"
                )
                .selectOption(
                    entidadeId
                );

            await page.waitForTimeout(
                800
            );

            const relatorios =
                await page
                    .locator(
                        "#ContentPlaceHolder1_ddlRelatorio option"
                    )
                    .evaluateAll(
                        options => {

                            return options
                                .map(
                                    option => ({

                                        id:
                                            option.value,

                                        nome:
                                            option
                                                .textContent
                                                .trim()
                                    })
                                )
                                .filter(
                                    option =>
                                        option.id &&
                                        option.nome &&
                                        !option.nome
                                            .toUpperCase()
                                            .includes(
                                                "SELECIONE"
                                            )
                                );
                        }
                    );

            console.log(
                "Relatórios encontrados:",
                relatorios.length
            );

            res.json({

                sucesso: true,

                relatorios
            });

        } catch (erro) {

            console.error(
                "Erro ao carregar relatórios:",
                erro.message
            );

            res.status(500).json({

                sucesso: false,

                erro:
                    erro.message
            });
        }
    }
);

// ======================================================
// CONSULTAR UM ANO
// ======================================================

async function consultarAno({

    municipioId,
    entidadeId,
    relatorioId,
    ano,
    periodo

}) {

    if (!page || !context) {

        throw new Error(
            "O navegador do TCE-PR ainda não está pronto."
        );
    }

    console.log("");
    console.log("---------------------------------");
    console.log("CONSULTANDO");

    console.log(
        "Município:",
        municipioId
    );

    console.log(
        "Entidade:",
        entidadeId
    );

    console.log(
        "Relatório:",
        relatorioId
    );

    console.log(
        "Ano:",
        ano
    );

    console.log(
        "Período:",
        periodo
    );

    console.log("---------------------------------");

    // ==================================================
    // MUNICÍPIO
    // ==================================================

    await page
        .locator(
            "#ContentPlaceHolder1_ddlMunicipio"
        )
        .selectOption(
            String(municipioId)
        );

    await page.waitForTimeout(
        500
    );

    // ==================================================
    // ENTIDADE
    // ==================================================

    await page
        .locator(
            "#ContentPlaceHolder1_ddlEntidade"
        )
        .selectOption(
            String(entidadeId)
        );

    await page.waitForTimeout(
        500
    );

    // ==================================================
    // RELATÓRIO
    // ==================================================

    await page
        .locator(
            "#ContentPlaceHolder1_ddlRelatorio"
        )
        .selectOption(
            String(relatorioId)
        );

    await page.waitForTimeout(
        500
    );

    // ==================================================
    // ANO
    // ==================================================

    const seletorAno =
        page.locator(
            "#ContentPlaceHolder1_ddlAno"
        );

    if (
        await seletorAno.count() === 0
    ) {

        throw new Error(
            "Seletor de ano não encontrado."
        );
    }

    await seletorAno.selectOption(
        String(ano)
    );

    await page.waitForTimeout(
        500
    );

    // ==================================================
    // PERÍODO
    // ==================================================

    const seletorPeriodo =
        page.locator(
            "#ContentPlaceHolder1_ddlPeriodo"
        );

    if (
        await seletorPeriodo.count() > 0
    ) {

        const existePeriodo =
            await seletorPeriodo
                .locator(
                    `option[value="${String(periodo)}"]`
                )
                .count();

        if (
            existePeriodo === 0
        ) {

            console.log(
                "Valor do período não encontrado diretamente:",
                periodo
            );

        } else {

            await seletorPeriodo
                .selectOption(
                    String(periodo)
                );

            await page.waitForTimeout(
                400
            );
        }
    }

    // ==================================================
    // BOTÃO CONSULTAR
    // ==================================================

    const botao =
        page.locator(
            "#ContentPlaceHolder1_btnConsulta"
        );

    if (
        await botao.count() === 0
    ) {

        throw new Error(
            "Botão Consultar não encontrado."
        );
    }

    // ==================================================
    // ABRIR RELATÓRIO
    // ==================================================

    const novaPaginaPromise =
        context.waitForEvent(
            "page",
            {
                timeout: 30000
            }
        );

    await botao.click();

    const paginaRelatorio =
        await novaPaginaPromise;

    console.log(
        "Nova aba do relatório aberta."
    );

    await paginaRelatorio
        .waitForLoadState(
            "domcontentloaded",
            {
                timeout: 60000
            }
        )
        .catch(() => {});

    await paginaRelatorio.waitForTimeout(
        4000
    );

    // ==================================================
    // PEGAR TEXTO
    // ==================================================

    const texto =
        await paginaRelatorio
            .locator("body")
            .innerText();

    // ==================================================
    // SALVAR LOG
    // ==================================================

    const pastaLogs =
        path.join(
            __dirname,
            "logs"
        );

    if (
        !fs.existsSync(pastaLogs)
    ) {

        fs.mkdirSync(
            pastaLogs,
            {
                recursive: true
            }
        );
    }

    fs.writeFileSync(

        path.join(
            pastaLogs,
            `relatorio_${ano}_${periodo}.txt`
        ),

        texto,

        "utf8"
    );

    // ==================================================
    // EXTRAIR DADOS
    // ==================================================

    const dados =
        extrairDadosRelatorio(
            texto
        );

    // ==================================================
    // FECHAR ABA
    // ==================================================

    await paginaRelatorio.close();

    return {

        ano,

        periodo,

        sucesso: true,

        ...dados
    };
}

// ======================================================
// CONSULTA INDIVIDUAL
// ======================================================

async function executarConsulta(req) {

    const municipioId =
        req.body?.municipio ||
        req.query?.municipio;

    const entidadeId =
        req.body?.entidade ||
        req.query?.entidade;

    const relatorioId =
        req.body?.relatorio ||
        req.query?.relatorio;

    const ano =
        req.body?.ano ||
        req.query?.ano ||
        String(obterAnoAtual());

    const periodo =
        req.body?.periodo ||
        req.query?.periodo ||
        String(obterMesAtual());

    if (!municipioId) {

        throw new Error(
            "Município não informado."
        );
    }

    if (!entidadeId) {

        throw new Error(
            "Entidade não informada."
        );
    }

    if (!relatorioId) {

        throw new Error(
            "Relatório não informado."
        );
    }

    return await consultarAno({

        municipioId,

        entidadeId,

        relatorioId,

        ano,

        periodo
    });
}

// ======================================================
// ROTA USADA PELO SEU FRONTEND
// ======================================================

app.post(
    "/api/consulta",
    async (req, res) => {

        try {

            console.log("");
            console.log("=================================");
            console.log("CONSULTA RECEBIDA PELO FRONTEND");
            console.log("=================================");

            const dados =
                await executarConsulta(req);

            // IMPORTANTE:
            // enviamos diretamente os dados
            // porque o seu JS espera:
            //
            // dados.rclAjustada
            // dados.dtp
            // dados.indice

            res.json(dados);

        } catch (erro) {

            console.error("");
            console.error("=================================");
            console.error("ERRO NA CONSULTA");
            console.error("=================================");

            console.error(
                erro.message
            );

            res.status(500).json({

                sucesso: false,

                erro:
                    erro.message
            });
        }
    }
);

// ======================================================
// ROTA GET ANTIGA
// ======================================================

app.get(
    "/consultar",
    async (req, res) => {

        try {

            const dados =
                await executarConsulta(req);

            res.json({

                sucesso: true,

                dados
            });

        } catch (erro) {

            console.error(
                "Erro na consulta:",
                erro.message
            );

            res.status(500).json({

                sucesso: false,

                erro:
                    erro.message
            });
        }
    }
);

// ======================================================
// HISTÓRICO
// ======================================================

app.get(
    "/historico",
    async (req, res) => {

        try {

            const municipioId =
                req.query.municipio;

            const entidadeId =
                req.query.entidade;

            const relatorioId =
                req.query.relatorio;

            const periodo =
                req.query.periodo ||
                "12";

            const anoInicial =
                Number(
                    req.query.anoInicial ||
                    ANO_INICIAL
                );

            const anoFinal =
                Number(
                    req.query.anoFinal ||
                    obterAnoAtual()
                );

            if (!municipioId) {

                throw new Error(
                    "Município não informado."
                );
            }

            if (!entidadeId) {

                throw new Error(
                    "Entidade não informada."
                );
            }

            if (!relatorioId) {

                throw new Error(
                    "Relatório não informado."
                );
            }

            if (
                Number.isNaN(anoInicial) ||
                Number.isNaN(anoFinal)
            ) {

                throw new Error(
                    "Ano inicial ou final inválido."
                );
            }

            if (
                anoInicial > anoFinal
            ) {

                throw new Error(
                    "O ano inicial não pode ser maior que o ano final."
                );
            }

            if (!page || !pronto) {

                throw new Error(
                    "O TCE-PR ainda está sendo inicializado."
                );
            }

            console.log("");
            console.log("=================================");
            console.log("CONSULTA HISTÓRICA");
            console.log("=================================");

            console.log(
                `Período: ${anoInicial} até ${anoFinal}`
            );

            console.log(
                "================================="
            );

            const historico = [];

            for (
                let ano = anoInicial;
                ano <= anoFinal;
                ano++
            ) {

                console.log("");
                console.log(
                    `CONSULTANDO ANO ${ano}`
                );

                const dados =
                    await consultarAno({

                        municipioId,

                        entidadeId,

                        relatorioId,

                        ano:
                            String(ano),

                        periodo:
                            String(periodo)
                    });

                historico.push(
                    dados
                );
            }

            console.log("");
            console.log("=================================");
            console.log("CALCULANDO EVOLUÇÕES");
            console.log("=================================");

            const resultado =
                calcularHistorico(
                    historico
                );

            console.log(
                "Histórico concluído."
            );

            res.json({

                sucesso: true,

                anoInicial,

                anoFinal,

                periodo,

                dados:
                    resultado
            });

        } catch (erro) {

            console.error("");

            console.error(
                "================================="
            );

            console.error(
                "ERRO NA CONSULTA HISTÓRICA"
            );

            console.error(
                "================================="
            );

            console.error(
                erro.message
            );

            res.status(500).json({

                sucesso: false,

                erro:
                    erro.message
            });
        }
    }
);

// ======================================================
// ROTA DE SAÚDE DO RENDER
// ======================================================

app.get(
    "/health",
    (req, res) => {

        res.json({

            sucesso: true,

            servidor: true,

            tcePrPronto: pronto
        });
    }
);

// ======================================================
// SERVIDOR
// ======================================================

app.listen(
    PORT,
    "0.0.0.0",
    async () => {

        console.log("");
        console.log("=================================");
        console.log(
            `Servidor rodando na porta ${PORT}`
        );
        console.log("=================================");

        console.log(
            "Ambiente:",
            process.env.RENDER
                ? "Render"
                : "Local"
        );

        console.log(
            "Ano atual:",
            obterAnoAtual()
        );

        console.log(
            "Mês atual:",
            obterMesAtual()
        );

        console.log(
            "Anos disponíveis:",
            gerarAnos()
        );

        console.log("=================================");

        try {

            await iniciarTCE();

        } catch (erro) {

            console.error("");

            console.error(
                "ERRO AO INICIAR TCE:"
            );

            console.error(
                erro.message
            );

            pronto = false;
        }
    }
);

// ======================================================
// ENCERRAMENTO
// ======================================================

process.on(
    "SIGTERM",
    async () => {

        console.log(
            "Encerrando servidor..."
        );

        if (browser) {

            await browser
                .close()
                .catch(() => {});
        }

        process.exit(0);
    }
);