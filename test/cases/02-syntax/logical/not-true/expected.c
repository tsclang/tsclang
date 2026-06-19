#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", (!true) ? "true" : "false");
    return 0;
}
