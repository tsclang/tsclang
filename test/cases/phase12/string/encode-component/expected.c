#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_url_encode_component(STR_LIT("hello world")).data);
    printf("%s\n", tsc_url_decode_component(STR_LIT("hello%20world")).data);
    return 0;
}
