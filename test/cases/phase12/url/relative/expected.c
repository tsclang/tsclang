#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    TscURL base = tsc_url_parse(STR_LIT("https://example.com/base/"));
    TscURL u = tsc_url_parse_relative(STR_LIT("../other"), &base);
    printf("%s\n", u.pathname.data);
    tsc_url_free(&u);
    tsc_url_free(&base);
    return 0;
}
