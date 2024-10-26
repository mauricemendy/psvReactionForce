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

function calculateForce(dn, fluidType, orifice, pressure) {
  var kfTable = {
    '50': {'gaz': 1.9, 'vapeur eau': 2},
    '65': {'gaz': 1.9, 'vapeur eau': 2},
    '80': {'gaz': 1.5, 'vapeur eau': 1.6},
    '100': {'gaz': 1.5, 'vapeur eau': 1.6},
    '150': {'gaz': 1.3, 'vapeur eau': 1.3},
    '200': {'gaz': 1.1, 'vapeur eau': 1.1},
    '>200': {'gaz': 1.1, 'vapeur eau': 1.1}
  };
  
  var areaTable = {
    'D': 0.71, 'E': 1.26, 'F': 1.98, 'G': 3.24, 'H': 5.06,
    'J': 8.3, 'K': 11.86, 'L': 18.41, 'M': 23.2, 'N': 28,
    'P': 41.2, 'Q': 71.2, 'R': 103, 'T': 168, 'V': 271, 'W': 406
  };
  
  var kf = kfTable[dn][fluidType];
  var area = areaTable[orifice];
  
  var force = kf * area * pressure;
  return force.toFixed(2);
}

function generatePDF(dn, fluidType, orifice, pressure, force) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet();
  
  // Clear the sheet mm
  sheet.clear();
  
  // Add title
  sheet.getRange("A1").setValue("PSV Force Calculation Report").setFontSize(14).setFontWeight("bold");
  
  // Add parameters and result
  sheet.getRange("A3").setValue("Parameters:");
  sheet.getRange("A4").setValue("DN (Diamètre Nominal):");
  sheet.getRange("B4").setValue(dn);
  sheet.getRange("A5").setValue("Type de fluide:");
  sheet.getRange("B5").setValue(fluidType);
  sheet.getRange("A6").setValue("Orifice:");
  sheet.getRange("B6").setValue(orifice);
  sheet.getRange("A7").setValue("Pression de décharge (bars absolus):");
  sheet.getRange("B7").setValue(pressure);
  
  sheet.getRange("A9").setValue("Result:");
  sheet.getRange("A10").setValue("Force de réaction (daN):");
  sheet.getRange("B10").setValue(force);
  
  // Format the sheet
  sheet.autoResizeColumns(1, 2);
  
  // Generate PDF
  var pdfFile = DriveApp.createFile(spreadsheet.getBlob().setName("PSV_Force_Calculation.pdf"));
  
  // Get the PDF download URL
  var pdfUrl = pdfFile.getDownloadUrl();
  
  return pdfUrl;
}
