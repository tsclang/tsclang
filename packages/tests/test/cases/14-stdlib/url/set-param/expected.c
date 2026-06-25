#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    TscURL u = tsc_url_parse(STR_LIT("https://example.com/"));
    tsc_url_params_set(&u, STR_LIT("key"), STR_LIT("value"));
    printf("%s\n", tsc_url_search(&u).data);
    tsc_url_free(&u);
    return 0;
}
