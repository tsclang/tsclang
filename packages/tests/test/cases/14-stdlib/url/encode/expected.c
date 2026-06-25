#include "runtime.h"
#include "std/url.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_url_encode(STR_LIT("hello world")).data);
    printf("%s\n", tsc_url_encode_component(STR_LIT("a=b&c=d")).data);
    return 0;
}
