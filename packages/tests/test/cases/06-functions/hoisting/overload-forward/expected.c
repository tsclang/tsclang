#include "runtime.h"

double pick_f64(double n) {
    return n * 2;
}

String pick_string(String s) {
    return tsc_string_concat(s, STR_LIT("!"));
}

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(pick_f64(1))));
    printf("%s\n", pick_string(STR_LIT("s")).data);
    return 0;
}
