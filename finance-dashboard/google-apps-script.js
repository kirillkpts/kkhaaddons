function doPost(e) {
  try {
    var folderId = 'your-folder-id-here'; // Replace with your Google Drive folder ID
    var folder = DriveApp.getFolderById(folderId);
    var name = (e.parameter && e.parameter.filename)
      ? e.parameter.filename
      : ('backup-' + new Date().toISOString() + '.json');
    name = name.replace(/[^\w.\-]/g, '_');
    var mime = (e.postData && e.postData.type) ? e.postData.type : 'application/json';
    var blob;
    if (e.postData && e.postData.bytes) {
      var decoded = Utilities.base64Decode(e.postData.bytes);
      blob = Utilities.newBlob(decoded, mime, name);
    } else {
      var contents = (e.postData && e.postData.contents) ? e.postData.contents : '';
      blob = Utilities.newBlob(contents, mime, name);
    }
    var file = folder.createFile(blob);
    return ContentService.createTextOutput(JSON.stringify({ ok:true, id:file.getId(), name:file.getName() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var folderId = 'your-folder-id-here'; // Replace with your Google Drive folder ID
    var folder = DriveApp.getFolderById(folderId);
    var args = e && e.parameter ? e.parameter : {};

    if (args.deleteId) {
      var file = DriveApp.getFileById(args.deleteId);
      file.setTrashed(true);
      return ContentService.createTextOutput(JSON.stringify({ ok:true, deleted: args.deleteId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (args.deleteName) {
      var removed = 0;
      var iterator = folder.getFilesByName(args.deleteName);
      while (iterator.hasNext()) {
        iterator.next().setTrashed(true);
        removed++;
      }
      if (!removed) {
        return ContentService.createTextOutput(JSON.stringify({ ok:false, error:"Not found" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ ok:true, deleted: removed }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (args.list) {
      var it = folder.getFiles();
      var files = [];
      while (it.hasNext()) {
        var f = it.next();
        files.push({
          id: f.getId(),
          name: f.getName(),
          ts: f.getLastUpdated().getTime(),
          size: f.getSize()
        });
      }
      files.sort(function(a,b){ return b.ts - a.ts; });
      return ContentService.createTextOutput(JSON.stringify({ ok:true, files: files }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (args.name) {
      var it2 = folder.getFilesByName(args.name);
      if (!it2.hasNext()) {
        return ContentService.createTextOutput(JSON.stringify({ ok:false, error:"Not found" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var f2 = it2.next();
      var blob = f2.getBlob();
      return ContentService.createTextOutput(blob.getDataAsString())
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:"Bad request" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
