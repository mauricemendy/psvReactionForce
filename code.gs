function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PSV Calculator')
    .addItem('Open Calculator', 'showSidebar')
    .addToUi();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('PSV Force Calculator')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

function calculateForce(dn, fluidType, orifice, pressure, configId, dlf) {
  // Tables centralisees dans config.gs (PSV_CONFIG)
  var kf = PSV_CONFIG.kfTable[dn][fluidType];
  var area = PSV_CONFIG.areaTable[orifice];

  var force = kf * area * pressure;

  // v2.0 - DLF and directional components (optional parameters)
  var dlfValue = (dlf !== undefined && dlf !== null) ? dlf : 2.0;
  var config = (configId && PSV_CONFIG.configurations[configId])
    ? PSV_CONFIG.configurations[configId]
    : PSV_CONFIG.configurations['CFG-1'];

  var fDesign = force * dlfValue;
  var fx = parseFloat((config.fx * fDesign).toFixed(2));
  var fy = parseFloat((config.fy * fDesign).toFixed(2));
  var fz = parseFloat((config.fz * fDesign).toFixed(2));

  return {
    force: parseFloat(force.toFixed(2)),
    dlf: dlfValue,
    fDesign: parseFloat(fDesign.toFixed(2)),
    fx: fx,
    fy: fy,
    fz: fz,
    config: config.id
  };
}

function generatePDF(dn, fluidType, orifice, pressure, force, dlf, fDesign, fx, fy, fz) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // Creer une feuille temporaire — ne jamais toucher a la feuille active
  var tempSheet = spreadsheet.insertSheet('_PSV_Report_Temp');

  try {
    // Titre
    tempSheet.getRange("A1").setValue("PSV Force Calculation Report")
      .setFontSize(14).setFontWeight("bold");

    // Parametres
    tempSheet.getRange("A3").setValue("Parametres:");
    tempSheet.getRange("A4").setValue("DN (Diametre Nominal):");
    tempSheet.getRange("B4").setValue(dn);
    tempSheet.getRange("A5").setValue("Type de fluide:");
    tempSheet.getRange("B5").setValue(fluidType);
    tempSheet.getRange("A6").setValue("Orifice:");
    tempSheet.getRange("B6").setValue(orifice);
    tempSheet.getRange("A7").setValue("Pression de decharge (bars absolus):");
    tempSheet.getRange("B7").setValue(pressure);

    // Resultat
    tempSheet.getRange("A9").setValue("Resultats:");
    tempSheet.getRange("A10").setValue("Force brute (daN):");
    tempSheet.getRange("B10").setValue(force);

    // v2.0 - Enriched results
    if (dlf !== undefined) {
      tempSheet.getRange("A11").setValue("DLF:");
      tempSheet.getRange("B11").setValue(dlf);
      tempSheet.getRange("A12").setValue("Force de design (daN):");
      tempSheet.getRange("B12").setValue(fDesign);
      tempSheet.getRange("A13").setValue("Fx (daN):");
      tempSheet.getRange("B13").setValue(fx);
      tempSheet.getRange("A14").setValue("Fy (daN):");
      tempSheet.getRange("B14").setValue(fy);
      tempSheet.getRange("A15").setValue("Fz (daN):");
      tempSheet.getRange("B15").setValue(fz);
      tempSheet.getRange("A17").setValue("Formules: F_brute = Kf x A x P1 | F_design = F_brute x DLF")
        .setFontStyle("italic");
    } else {
      tempSheet.getRange("A12").setValue("Formule: F = Kf x A x P1")
        .setFontStyle("italic");
    }

    tempSheet.autoResizeColumns(1, 2);

    // Exporter uniquement la feuille temporaire en PDF
    var url = spreadsheet.getUrl().replace(/\/edit.*$/, '')
      + '/export?format=pdf'
      + '&gid=' + tempSheet.getSheetId()
      + '&size=letter'
      + '&portrait=true';

    var token = ScriptApp.getOAuthToken();
    var response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    var pdfBlob = response.getBlob().setName('PSV_Force_Calculation.pdf');
    var pdfFile = DriveApp.createFile(pdfBlob);

    return pdfFile.getDownloadUrl();
  } finally {
    // Toujours supprimer la feuille temporaire, meme en cas d'erreur
    spreadsheet.deleteSheet(tempSheet);
  }
}
