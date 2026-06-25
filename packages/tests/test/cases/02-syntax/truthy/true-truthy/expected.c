#include "runtime.h"

int main(void) {
    TSC_INIT();
    if (true) {
        printf("yes\n");
    } else {
        printf("no\n");
    }
    return 0;
}
