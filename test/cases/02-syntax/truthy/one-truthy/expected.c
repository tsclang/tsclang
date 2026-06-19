#include "runtime.h"

int main(void) {
    TSC_INIT();
    if (1) {
        printf("yes\n");
    } else {
        printf("no\n");
    }
    return 0;
}
