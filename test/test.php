<?php

function sha1Hash($str) {
    return hash('sha1', $str);
}

function decryptText($data, $key) {
    $key = $key ?? [115, -36, 110, -93, 78, -22, 63, -71, 97, -126, 86, 66, -36, 46, 13, -96];
    $key = array_map(function($byte) {
        return chr($byte < 0 ? $byte + 256 : $byte);
    }, $key);
    $key = implode('', $key);

    $rc4 = new RC4();
    $rc4->setKey($key);
    $outputBuffer = $rc4->decrypt($data);

    // Debugging: Check the first few bytes of the decrypted data
    $firstBytes = substr($outputBuffer, 0, 10);
    echo "First bytes of decrypted data: " . bin2hex($firstBytes) . "\n";

    // Debugging: Check the decrypted data as a string
    echo "Decrypted data (first 100 chars): " . substr($outputBuffer, 0, 100) . "\n";

    $responseInflateBuffer = '';
    try {
        $responseInflateBuffer = zlib_decode($outputBuffer);
        if ($responseInflateBuffer === false) {
            echo "Decompression failed: " . error_get_last()['message'] . "\n";
        } else {
            echo "Decompression successful.\n";
        }
    } catch (Exception $e) {
        echo "Decompression failed: " . $e->getMessage() . "\n";
    }

    // Debugging: Check the first few bytes of the decompressed data
    $firstBytesDecompressed = substr($responseInflateBuffer, 0, 10);
    echo "First bytes of decompressed data: " . bin2hex($firstBytesDecompressed) . "\n";

    // Debugging: Check the decompressed data as a string
    echo "Decompressed data (first 100 chars): " . substr($responseInflateBuffer, 0, 100) . "\n";

    // FIX NEW LINES PROBLEM
    $responseInflateBuffer = mb_convert_encoding($responseInflateBuffer, 'UTF-8', 'auto');

    // Manually replace or remove problematic characters
    $problematicChars = ["\xEF\xBF\xBC"]; // Unicode replacement character
    foreach ($problematicChars as $char) {
        $responseInflateBuffer = str_replace($char, "\n", $responseInflateBuffer);
    }

    // Debugging: Check the final data
    echo "Final data (first 100 chars): " . substr($responseInflateBuffer, 0, 100) . "\n";

    return $responseInflateBuffer;
}

function decryptBinary($data, $key) {
    $key = $key ?? [115, -36, 110, -93, 78, -22, 63, -71, 97, -126, 86, 66, -36, 46, 13, -96];
    $key = array_map(function($byte) {
        return chr($byte < 0 ? $byte + 256 : $byte);
    }, $key);
    $key = implode('', $key);

    $rc4 = new RC4();
    $rc4->setKey($key);
    $outputBuffer = $rc4->decrypt($data);

    return $outputBuffer;
}

class RC4 {
    private $perm = [];
    private $index1 = 0;
    private $index2 = 0;

    public function setKey($key) {
        $keyLength = strlen($key);
        for ($i = 0; $i < 256; $i++) {
            $this->perm[$i] = $i;
        }
        $j = 0;
        for ($i = 0; $i < 256; $i++) {
            $j = ($j + $this->perm[$i] + ord($key[$i % $keyLength])) % 256;
            $this->swap($i, $j);
        }
        $this->index1 = 0;
        $this->index2 = 0;
    }

    public function decrypt($data) {
        $result = '';
        $dataLength = strlen($data);
        for ($i = 0; $i < $dataLength; $i++) {
            $this->index1 = ($this->index1 + 1) % 256;
            $this->index2 = ($this->index2 + $this->perm[$this->index1]) % 256;
            $this->swap($this->index1, $this->index2);
            $j = ($this->perm[$this->index1] + $this->perm[$this->index2]) % 256;
            $result .= chr(ord($data[$i]) ^ $this->perm[$j]);
        }
        return $result;
    }

    private function swap($i, $j) {
        $temp = $this->perm[$i];
        $this->perm[$i] = $this->perm[$j];
        $this->perm[$j] = $temp;
    }
}

function decrypt($str, $userAccessToken) {
    // Calculate SHA1 hash using PHP's hash function
    $sha1Hash = sha1Hash($userAccessToken . "platform");

    // Ensure SHA1 hash is 32 characters long
    if (strlen($sha1Hash) > 32) {
        $sha1Hash = substr($sha1Hash, 0, 32);
    } else if (strlen($sha1Hash) < 32) {
        $sha1Hash = str_pad($sha1Hash, 32, '0');
    }

    // Decode Base64 string
    $decodedBytes = base64_decode($str);

    // Create encryption context
    $iv = '1234567812345678'; // IV (Initialization Vector)
    $key = $sha1Hash;

    // Log key and IV
    echo "Key: $key\n";
    echo "IV: $iv\n";

    // Decrypt using OpenSSL
    $decryptedBytes = openssl_decrypt($decodedBytes, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);

    if ($decryptedBytes === false) {
        $error = openssl_error_string();
        throw new Exception('Decryption failed: ' . $error);
    }

    return $decryptedBytes;
}

function getBytes($filePath) {
    $inputStream = fopen($filePath, 'rb');
    if ($inputStream === false) {
        throw new Exception("Failed to open file: $filePath");
    }

    $bufferSize = 6144; // BUFFER_SIZE equivalent
    $byteArrayOutputStream = '';

    while (!feof($inputStream)) {
        $byteArrayOutputStream .= fread($inputStream, $bufferSize);
    }

    fclose($inputStream);
    return $byteArrayOutputStream;
}

function getBytesFromStream($inputStream) {
    $bufferSize = 6144; // BUFFER_SIZE equivalent
    $byteArrayOutputStream = '';

    while (!feof($inputStream)) {
        $byteArrayOutputStream .= fread($inputStream, $bufferSize);
    }

    return $byteArrayOutputStream;
}

function appendFiles($bArr, $bArr2, $filePath) {
    // Combine buffers
    $combinedBuffer = $bArr . $bArr2;

    // Create a ZipInputStream from the combined buffer
    $zipInputStream = new ZipArchive();
    $tempFile = tempnam(sys_get_temp_dir(), 'combined_data');
    file_put_contents($tempFile, $combinedBuffer);
    $zipInputStream->open($tempFile);

    $bufferSize = 6144; // BUFFER_SIZE equivalent
    $headerKey = null;
    $bodyData = null;

    for ($i = 0; $i < $zipInputStream->numFiles; $i++) {
        $stat = $zipInputStream->statIndex($i);
        $name = $stat['name'];

        if ($name === 'header') {
            $stream = $zipInputStream->getStream($name);
            $headerKey = [];
            while (!feof($stream)) {
                $byte = fread($stream, 1);
                if ($byte !== false) {
                    $headerKey[] = ord($byte);
                }
            }
            fclose($stream);
        } elseif ($name === 'body') {
            $stream = $zipInputStream->getStream($name);
            $fileOutputStream = fopen($filePath, 'wb');

            while (!feof($stream)) {
                $data = fread($stream, $bufferSize);
                fwrite($fileOutputStream, $data);
            }

            fclose($fileOutputStream);
            fclose($stream);
        }
    }

    $zipInputStream->close();
    unlink($tempFile);

    return $headerKey;
}

// Example usage
try {
    $decryptedData = decrypt('---add here---', '---add here---');
    if (!$decryptedData) {
        echo "Decryption failed\n";
        exit;
    }

    // Convert decrypted data to hex
    $bArr = $decryptedData;

    $bArr2 = getBytes('./---add here---');
    unlink('./output.zip');
    $filePath = './output.zip';

    $headerKey = appendFiles($bArr, $bArr2, $filePath);

    delete_all('./output');
    $zip = new ZipArchive;
    if ($zip->open($filePath) === TRUE) {
        $zip->extractTo('./output');
        $zip->close();
        echo "Files extracted successfully.\n";
    } else {
        echo "Failed to extract files.\n";
    }

    $files = scandir('./output');
    foreach ($files as $file) {
        echo "File: $file\n";
        if ($file === '.' || $file === '..') {
            continue;
        }
        if (is_dir('./output/' . $file)) {
            $subFiles = scandir('./output/' . $file);
            foreach ($subFiles as $subFile) {
                echo "Subfile: $subFile\n";
                if ($subFile === '.' || $subFile === '..') {
                    continue;
                }
                // Decrypt .html + .json files using decryptText
                if ((str_ends_with($subFile, '.html') ||  str_ends_with($subFile, '.spans')  || str_ends_with($subFile, '.json')) && $subFile !== 'info.json') {
                    echo "Decrypting $subFile\n";
                    $fileContents = file_get_contents('./output/' . $file . '/' . $subFile);

                    $decryptedFileContents = decryptText($fileContents, $headerKey);
                    // Save decrypted files
                    file_put_contents('./output/' . $file . '/' . $subFile, $decryptedFileContents);
                }
            }
            continue;
        }

    }

    echo "Files appended and processed successfully.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

function delete_all($item) {
    if (is_dir($item)) {
        array_map('delete_all', array_diff(glob("$item/{,.}*", GLOB_BRACE), array("$item/.", "$item/..")));
        rmdir($item);
    } else {
        unlink($item);
    }
}