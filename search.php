<?php
$accepted = [
    'JPEG',
    'JPG',
    'PNG',
    'PNG8',
    'PNG24',
    'GIF',
    'BMP',
    'WEBP',
    'RAW',
    'ICO',
    'PDF',
    'TIFF',
    'EPS'
];

$failed = true;
for ($i = 0; $i < count ($accepted); $i++) {
    if (str_ends_with (strtolower ($argv[1]), strtolower ($accepted[$i]))){
        $failed = false;
    }
}

if ($failed && !is_numeric(substr($argv[1], -1))) {
    die ("Malformed URL");
}
if (!filter_var ($argv[1], FILTER_VALIDATE_URL)) {
    die ("Malformed URL");
}
$base = $argv[1];

$ch = curl_init('https://images.google.com/searchbyimage?image_url=' . $base . '&encoded_image=&image_content=&filename=&hl=en');
curl_setopt_array ($ch, 
[
    CURLOPT_HEADER => "true",
    CURLOPT_RETURNTRANSFER => 1,
    CURLOPT_POST => 0,
    CURLOPT_SSL_VERIFYHOST => 0,
    CURLOPT_SSL_VERIFYPEER => 0,
    CURLOPT_REFERER => "https://images.google.com/",
    CURLOPT_USERAGENT => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36",
    CURLOPT_FOLLOWLOCATION => 1
]);


$Response = curl_exec ($ch);
//echo $Response;
while (str_contains ($Response, "The document has moved")){
    $start = stripos ($Response, "<A HREF=") + 9;
    $end = stripos ($Response, ">here</A>.");
    $url = substr ($Response, $start , ($end - $start - 1));
    curl_setopt ($ch, CURLOPT_URL, $url);
    $Response = curl_exec ($ch);
}

if (str_contains ($Response, "The URL doesn't refer to an image, or the image is not publicly accessible.")){
    curl_setopt_array ($ch, 
    [
        CURLOPT_URL => "https://www.google.com/search?q=" . $base . "&source=lmns&bih=841&biw=1680&hl=en&sa=X&ved=2ahUKEwihlrv_05vxAhXHAjQIHfd9CAUQ_AUoAHoECAEQAA",
        CURLOPT_REFERER => "https://www.google.com/"
    ]);
    $Response = curl_exec ($ch);
}

$words = 
[
    "anime",
    "genshin",
    "chibi",
    "hentai",
    "manga",
    "webtoon",
    "doujin"
];

$count = 0;
foreach ($words as $word) {
    $count += substr_count(strtolower($Response), $word);
    //echo $count;
}

if ($count > 1) {
    echo "true";
} else {
    echo "false";
}
curl_close ($ch);

?>
