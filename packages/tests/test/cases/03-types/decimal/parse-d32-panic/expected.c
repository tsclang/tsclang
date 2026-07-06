#include "runtime.h"

int main(void) {
    TSC_INIT();
    d32_t x = tsc_d32_parse(STR_LIT("abc"));
    return 0;
}
