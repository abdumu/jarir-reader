package app.tauri.sharesheet

import android.app.Activity
import android.content.Intent
import android.webkit.MimeTypeMap
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class ShareTextOptions {
    lateinit var text: String
    var mimeType: String = "text/plain"
    var title: String? = null
}

@InvokeArg
class ShareFileOptions {
    var file: String? = null
    var mimeType: String = "*/*"
    var title: String? = null

    override fun toString(): String {
        return "ShareFileOptions(file=$file, mimeType=$mimeType, title=$title)"
    }
}

@TauriPlugin
class SharesheetPlugin(private val activity: Activity) : Plugin(activity) {
    /** Open the Sharesheet to share some text */
    @Command
    fun shareText(invoke: Invoke) {
        val args = invoke.parseArgs(ShareTextOptions::class.java)

        val sendIntent =
                Intent().apply {
                    this.action = Intent.ACTION_SEND
                    this.type = args.mimeType
                    this.putExtra(Intent.EXTRA_TEXT, args.text)
                    this.putExtra(Intent.EXTRA_TITLE, args.title)
                }

        val shareIntent = Intent.createChooser(sendIntent, null)
        shareIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        activity.applicationContext?.startActivity(shareIntent)
    }

    /** Open the Sharesheet to share a file */
    @Command
    fun shareFile(invoke: Invoke) {
        val args = invoke.parseArgs(ShareFileOptions::class.java)


        val isSave = args.file?.startsWith("save://") == true
        //if file starts with "save://" remove it. This is a workaround to allow saving files
        val absolutePath = if (isSave) args.file?.substringAfter("save://") else args.file


        if (absolutePath.isNullOrEmpty()) {
            throw IllegalArgumentException("File path must be provided. Args: $args")
        }

        // Split the path to get the file name after the package name
        val filePath = absolutePath.substringAfter("${activity.packageName}/")
        val folderPath = absolutePath.substringBefore(filePath)

        val file = File(folderPath, filePath)

        if (!file.exists()) {
            throw IllegalArgumentException("File does not exist at path:\n $absolutePath")
        }



        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)

        val mimeType =
                if (args.mimeType.isNullOrEmpty() || args.mimeType == "*/*") {
                    val extension = MimeTypeMap.getFileExtensionFromUrl(uri.toString())
                    MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "*/*"
                } else {
                    args.mimeType
                }

        if (isSave) {
            setCurrentFilePath(file.absolutePath)
            saveFile(invoke, file, args.mimeType, args.title ?: file.name)
            return
        } 

        val sendIntent =
                Intent().apply {
                    this.action = Intent.ACTION_SEND
                    this.type = mimeType
                    this.putExtra(Intent.EXTRA_STREAM, uri)
                    this.putExtra(Intent.EXTRA_TITLE, args.title)
                    this.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                

        val shareIntent = Intent.createChooser(sendIntent, null)
        shareIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        activity.applicationContext?.startActivity(shareIntent)
    }


    fun saveFile(invoke: Invoke, file: File, mimeType: String, title: String) {

        val saveIntent =
                Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    this.addCategory(Intent.CATEGORY_OPENABLE)
                    this.type = mimeType
                    this.putExtra(Intent.EXTRA_TITLE, file.name)
                }

        startActivityForResult(invoke, saveIntent, "saveFileResult")
    }   

    @ActivityCallback
    private fun saveFileResult(invoke: Invoke, result: ActivityResult) {
        invoke.resolve()
        val data = result.data
        data?.data?.let { uri ->
            val outputStream = activity.contentResolver.openOutputStream(uri)
            val inputStream = File(currentFilePath).inputStream()
            inputStream.copyTo(outputStream!!)
            outputStream.close()
            inputStream.close()
        }
    }

    companion object {
        private lateinit var currentFilePath: String
        fun setCurrentFilePath(path: String) {
            currentFilePath = path
        }
    }
}