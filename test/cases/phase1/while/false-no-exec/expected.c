#include "runtime.h"

int main(void) {
    TSC_INIT();
    while (false) {
        printf("never\n");
    }
    return 0;
}
