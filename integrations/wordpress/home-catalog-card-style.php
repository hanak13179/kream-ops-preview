/* Match homepage recommendations to the Cakes & Desserts catalog cards. */
add_action('wp_head', function() {
    if (!is_front_page()) { return; }
    ?>
    <style id="kream-home-catalog-card-style">
    body.home .kream-home-products .kream-home-product-image{aspect-ratio:1/1!important;max-height:none!important;border-radius:0!important;overflow:hidden}
    body.home .kream-home-products .kream-home-product-image img{width:100%!important;height:100%!important;max-height:none!important;object-fit:cover!important;border-radius:0!important;display:block}
    body.home .kream-home-products .kream-home-product h3,
    body.home .kream-home-products .kream-home-product h3 a{font-family:Arial,sans-serif!important;font-size:16px!important;font-weight:700!important;line-height:24px!important;color:#f24824!important}
    body.home .kream-home-products .kream-home-product h3{margin:0!important;padding:0!important}
    body.home .kream-home-products .kream-cake-sizes{font-family:Arial,sans-serif!important;font-size:13px!important;font-weight:400!important;line-height:19.5px!important;color:#8a6b5c!important;margin:3px 0 6px!important;letter-spacing:.025em!important}
    body.home .kream-home-products .kream-home-product-price{font-family:Arial,sans-serif!important;font-size:16px!important;font-weight:400!important;line-height:24px!important;color:#f24823!important;margin:0 0 8px!important}
    body.home .kream-home-products .kream-home-product-price ins{background:transparent!important}
    body.home .kream-home-products .kream-product-section-heading h2{font-family:Arial,sans-serif!important;font-weight:700!important;font-size:32px!important;line-height:1.3!important}
    @media(max-width:600px){body.home .kream-home-products .kream-product-section-heading h2{font-size:25px!important}}
    </style>
    <?php
}, 999);
