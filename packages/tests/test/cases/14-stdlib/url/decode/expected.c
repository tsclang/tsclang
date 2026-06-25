#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_url_decode(STR_LIT("hello%20world")).data);
    printf("%s\n", tsc_url_decode_component(STR_LIT("a%3Db%26c%3Dd")).data);
    return 0;
}
